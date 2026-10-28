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

# 메일을 쓰지 않는 도메인이므로 이 도메인을 사칭한 메일이 수신 측에서 거부되도록 한다
locals {
  email_lockdown_records = {
    spf   = { type = "TXT", name = var.domain, content = "\"v=spf1 -all\"" }
    dmarc = { type = "TXT", name = "_dmarc.${var.domain}", content = "\"v=DMARC1; p=reject; sp=reject; adkim=s; aspf=s\"" }
    dkim  = { type = "TXT", name = "*._domainkey.${var.domain}", content = "\"v=DKIM1; p=\"" }
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

# RFC 7505 null MX: 이 도메인은 메일을 받지 않는다
resource "cloudflare_dns_record" "null_mx" {
  zone_id  = local.zone_id
  type     = "MX"
  name     = var.domain
  content  = "."
  priority = 0
  ttl      = 3600
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
