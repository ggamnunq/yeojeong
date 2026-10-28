locals {
  secrets = {
    database_url = {
      id   = "yeojeong-database-url"
      data = local.database_url
    }
    direct_url = {
      id   = "yeojeong-direct-url"
      data = local.direct_url
    }
    supabase_ca = {
      id   = "yeojeong-supabase-ca"
      data = file("${path.module}/certs/supabase-prod-ca-2021.crt")
    }
    origin_secret = {
      id   = "yeojeong-origin-secret"
      data = random_password.origin_secret.result
    }
    # 카카오디벨로퍼스 앱 「여정」의 REST API 키와 카카오 로그인 클라이언트 시크릿(변수, tfvars 또는 TF_VAR_*)
    kakao_client_id = {
      id   = "yeojeong-kakao-client-id"
      data = var.kakao_client_id
    }
    kakao_client_secret = {
      id   = "yeojeong-kakao-client-secret"
      data = var.kakao_client_secret
    }
    session_secret = {
      id   = "yeojeong-session-secret"
      data = random_password.session_secret.result
    }
    token_encryption_key = {
      id   = "yeojeong-token-encryption-key"
      data = random_bytes.token_encryption_key.base64
    }
    user_ref_hmac_key = {
      id   = "yeojeong-user-ref-hmac-key"
      data = random_password.user_ref_hmac_key.result
    }
    audit_hmac_key = {
      id   = "yeojeong-audit-hmac-key"
      data = random_password.audit_hmac_key.result
    }
  }
}

resource "google_secret_manager_secret" "this" {
  for_each  = local.secrets
  secret_id = each.value.id

  replication {
    user_managed {
      replicas {
        location = var.region
      }
    }
  }

  depends_on = [google_project_service.this]
}

resource "google_secret_manager_secret_version" "this" {
  for_each    = local.secrets
  secret      = google_secret_manager_secret.this[each.key].id
  secret_data = each.value.data
}

# Cloudflare Worker만 아는 값. API는 이 값이 담긴 헤더가 없는 요청을 거부한다(origin lock).
resource "random_password" "origin_secret" {
  length  = 48
  special = false
}

# 쿠키 서명용(OAuth state, 가입 대기). 바꾸면 진행 중인 로그인·가입만 다시 하면 된다.
resource "random_password" "session_secret" {
  length  = 64
  special = false
}

# *_enc 컬럼(금융기관 토큰 등) AES-256-GCM 키. 바꾸면 기존 암호문을 풀 수 없으니 재암호화 절차 없이 바꾸지 않는다.
resource "random_bytes" "token_encryption_key" {
  length = 32

  lifecycle {
    prevent_destroy = true
  }
}

# 교체 금지: 동의 기록·탈퇴 처리 기록의 user_ref_hash(HMAC-SHA256(userId, 이 키))를 같은 사용자로 묶는 키다.
# 바꾸면 탈퇴 후 보존 중인 기록과의 연결이 끊긴다. prevent_destroy로 교체(-replace 포함)를 막는다.
resource "random_password" "user_ref_hmac_key" {
  length  = 64
  special = false

  lifecycle {
    prevent_destroy = true
  }
}

# 접속 IP는 원문 대신 HMAC-SHA256로만 기록한다. 키 교체 시 과거 로그를 같은 IP로 연결할 수 없다.
resource "random_password" "audit_hmac_key" {
  length  = 64
  special = false

  lifecycle {
    prevent_destroy = true
  }
}
