resource "random_password" "db" {
  length  = 48
  special = false
}

resource "supabase_project" "prod" {
  organization_id   = var.supabase_organization_id
  name              = "yeojeong-prod"
  region            = var.supabase_region
  database_password = random_password.db.result
  # 예전 방식의 anon/service_role JWT 키를 끈다 (provider는 deprecated 경고를 낸다)
  legacy_api_keys_enabled = false

  lifecycle {
    prevent_destroy = true
  }
}

resource "supabase_settings" "prod" {
  project_ref     = supabase_project.prod.id
  ssl_enforcement = true

  # 앱은 Prisma로 Postgres에 직접 붙는다. Data API(PostgREST)에는 어떤 스키마도 노출하지 않는다.
  api = jsonencode({
    db_schema = ""
  })

  # Supabase Auth는 쓰지 않으므로 가입을 막아 둔다
  auth = jsonencode({
    disable_signup = true
  })
}

data "supabase_pooler" "prod" {
  project_ref = supabase_project.prod.id
}

locals {
  # 예: postgresql://postgres.<ref>:[YOUR-PASSWORD]@aws-0-ap-northeast-2.pooler.supabase.com:6543/postgres
  pooler = regex(
    "^postgres(?:ql)?://(?P<user>[^:]+):[^@]*@(?P<host>[^:/]+):\\d+/(?P<database>[^?]+)",
    data.supabase_pooler.prod.url["transaction"],
  )
  db_ca_mount_dir = "/etc/supabase"

  # 런타임: Supavisor transaction 모드(IPv4) + TLS 인증서 검증
  database_url = format(
    "postgresql://%s:%s@%s:6543/%s?sslmode=verify-full&sslrootcert=%s/ca.crt",
    local.pooler.user, random_password.db.result, local.pooler.host, local.pooler.database, local.db_ca_mount_dir,
  )

  # 마이그레이션 등 CLI: Supavisor session 모드
  direct_url = format(
    "postgresql://%s:%s@%s:5432/%s?sslmode=require",
    local.pooler.user, random_password.db.result, local.pooler.host, local.pooler.database,
  )
}
