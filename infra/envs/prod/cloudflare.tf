# 같은 Cloudflare 계정에 다른 프로젝트(zone, R2)가 있다. 여기서는 jinyeojeong.com zone과 yeojeong-web Worker만 다룬다.
# zone 자체는 Registrar 구매로 만들어졌으므로 참조만 한다.
data "cloudflare_zone" "web" {
  filter = {
    name    = var.domain
    account = { id = var.cloudflare_account_id }
  }
}

locals {
  zone_id = data.cloudflare_zone.web.zone_id
}

resource "cloudflare_zone_dnssec" "web" {
  zone_id = local.zone_id
  status  = "active"
}

# Worker 스크립트 업로드는 wrangler(GitHub Actions)가, 진입 도메인 연결은 여기서 맡는다
resource "cloudflare_workers_custom_domain" "web" {
  account_id = var.cloudflare_account_id
  zone_id    = local.zone_id
  hostname   = var.domain
  service    = var.web_worker_name
}

locals {
  zone_settings = {
    ssl                      = "strict"
    always_use_https         = "on"
    min_tls_version          = "1.2"
    tls_1_3                  = "on"
    automatic_https_rewrites = "on"
    # preload는 목록에서 빠지기 어려우므로 켜지 않는다
    security_header = {
      strict_transport_security = {
        enabled            = true
        max_age            = 31536000
        include_subdomains = true
        preload            = false
        nosniff            = true
      }
    }
  }
}

resource "cloudflare_zone_setting" "web" {
  for_each   = local.zone_settings
  zone_id    = local.zone_id
  setting_id = each.key
  value      = each.value
}

# 이 도메인은 메일을 보내지 않는다. 사칭 메일이 수신 측에서 거부되도록 DMARC는 reject로 둔다.
# 받기는 Email Routing으로 support@ 하나만 연다(아래). 예전 null MX와 SPF "-all"은 Email Routing과 충돌해 지웠다.
locals {
  email_lockdown_records = {
    dmarc = { type = "TXT", name = "_dmarc.${var.domain}", content = "\"v=DMARC1; p=reject; sp=reject; adkim=s; aspf=s\"" }
    # 다른 선택자는 모두 폐기 키. Email Routing 전달 서명용 cf2024-1._domainkey는 이름이 정확히 있어 와일드카드보다 우선한다
    dkim = { type = "TXT", name = "*._domainkey.${var.domain}", content = "\"v=DKIM1; p=\"" }
  }
}

resource "cloudflare_dns_record" "email_lockdown" {
  for_each = local.email_lockdown_records
  zone_id  = local.zone_id
  type     = each.value.type
  name     = each.value.name
  content  = each.value.content
  ttl      = 3600
}

# ── 고객센터 메일 수신(Cloudflare Email Routing, 기능명세 L-2·FR-108) ──
# Email Routing을 켜면 Cloudflare가 apex에 MX(route1~3.mx.cloudflare.net, 우선순위는 Cloudflare가 정함),
# SPF("v=spf1 include:_spf.mx.cloudflare.net ~all"), DKIM(cf2024-1._domainkey)을 직접 만들고 잠근다.
# 그래서 이 세 레코드는 cloudflare_dns_record로 만들지 않는다(같은 레코드를 두 곳에서 만들면 충돌한다).
# 켜기 전에 apex에 다른 MX·SPF가 없어야 한다 → 아래 precondition이 확인한다(첫 적용 순서는 PR·README 참고).
data "cloudflare_dns_records" "apex_mail" {
  zone_id = local.zone_id
  name    = { exact = var.domain }
}

locals {
  # HCL의 &&는 단락 평가를 하지 않으므로 content가 없는 레코드(CAA 등)는 빈 문자열로 바꿔 둔다
  apex_mail_records = [
    for r in data.cloudflare_dns_records.apex_mail.result : {
      type    = r.type
      content = r.content == null ? "" : r.content
    } if contains(["MX", "TXT"], r.type)
  ]
  apex_conflicting_mail_records = [
    for r in local.apex_mail_records : "${r.type} ${r.content}"
    if(r.type == "MX" && !endswith(trimsuffix(r.content, "."), ".mx.cloudflare.net")) ||
    (r.type == "TXT" && strcontains(r.content, "v=spf1") && !strcontains(r.content, "include:_spf.mx.cloudflare.net"))
  ]
}

resource "cloudflare_email_routing_dns" "web" {
  zone_id = local.zone_id
  name    = var.domain

  lifecycle {
    precondition {
      condition     = length(local.apex_conflicting_mail_records) == 0
      error_message = "apex에 Email Routing과 충돌하는 MX/SPF가 남아 있습니다. 먼저 지운 뒤 다시 적용하세요(PR·README의 첫 적용 순서)."
    }
  }
}

# 확인 메일의 링크를 운영자가 한 번 눌러야 verified가 되고 전달이 시작된다
resource "cloudflare_email_routing_address" "support_forward" {
  account_id = var.cloudflare_account_id
  email      = var.support_forward_to
}

resource "cloudflare_email_routing_rule" "support" {
  zone_id = local.zone_id
  name    = "support -> operator"
  enabled = true

  matchers = [{
    type  = "literal"
    field = "to"
    value = var.support_email
  }]

  actions = [{
    type  = "forward"
    value = [cloudflare_email_routing_address.support_forward.email]
  }]

  lifecycle {
    precondition {
      condition     = endswith(lower(var.support_email), "@${var.domain}")
      error_message = "support_email은 ${var.domain} 주소여야 Email Routing으로 받을 수 있습니다."
    }
  }

  depends_on = [cloudflare_email_routing_dns.web]
}

# 그 밖의 주소는 받지 않는다. catch-all을 꺼 두면 Cloudflare가 SMTP 단계에서 거부(반송)한다.
# drop(조용히 버림)보다 보낸 사람이 실패를 알 수 있고, 스팸을 받아 두지도 않는다.
resource "cloudflare_email_routing_catch_all" "web" {
  zone_id = local.zone_id
  name    = "catch-all (disabled = reject)"
  enabled = false

  matchers = [{ type = "all" }]
  actions  = [{ type = "drop" }]

  depends_on = [cloudflare_email_routing_dns.web]
}

# www는 apex로 보낸다. 프록시만 통과시키기 위한 자리표시 주소(100::)를 쓴다.
resource "cloudflare_dns_record" "www" {
  zone_id = local.zone_id
  type    = "AAAA"
  name    = "www.${var.domain}"
  content = "100::"
  proxied = true
  ttl     = 1
}

resource "cloudflare_ruleset" "redirects" {
  zone_id = local.zone_id
  name    = "yeojeong redirects"
  kind    = "zone"
  phase   = "http_request_dynamic_redirect"

  rules = [{
    description = "www -> apex"
    expression  = "(http.host eq \"www.${var.domain}\")"
    action      = "redirect"
    action_parameters = {
      from_value = {
        status_code           = 301
        preserve_query_string = true
        target_url = {
          expression = "concat(\"https://${var.domain}\", http.request.uri.path)"
        }
      }
    }
  }]
}

# Free 플랜은 규칙 1개, 10초 단위만 된다. 앱의 IP당 분당 120회 제한보다 느슨한 1차 방어선이다.
resource "cloudflare_ruleset" "rate_limit" {
  zone_id = local.zone_id
  name    = "yeojeong rate limit"
  kind    = "zone"
  phase   = "http_ratelimit"

  rules = [{
    description = "API burst limit per IP"
    expression  = "(starts_with(http.request.uri.path, \"/api/\"))"
    action      = "block"
    ratelimit = {
      characteristics     = ["cf.colo.id", "ip.src"]
      period              = 10
      requests_per_period = 50
      mitigation_timeout  = 10
    }
  }]
}
