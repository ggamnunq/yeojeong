resource "google_service_account" "api_runtime" {
  account_id   = "yeojeong-api-runtime"
  display_name = "yeojeong API runtime (Cloud Run)"
}

locals {
  # Cloud Run env 이름 → secrets.tf의 키. 런타임 서비스 계정은 이 시크릿들만 읽는다.
  api_secret_env = {
    KAKAO_CLIENT_ID      = "kakao_client_id"
    KAKAO_CLIENT_SECRET  = "kakao_client_secret"
    SESSION_SECRET       = "session_secret"
    TOKEN_ENCRYPTION_KEY = "token_encryption_key"
    USER_REF_HMAC_KEY    = "user_ref_hmac_key"
    AUDIT_HMAC_KEY       = "audit_hmac_key"
    IMPORT_KEY_HMAC_KEY  = "import_key_hmac_key"
  }
}

resource "google_secret_manager_secret_iam_member" "api_runtime" {
  for_each  = toset(concat(["database_url", "supabase_ca", "origin_secret"], values(local.api_secret_env)))
  secret_id = google_secret_manager_secret.this[each.value].id
  role      = "roles/secretmanager.secretAccessor"
  member    = google_service_account.api_runtime.member
}

# 사용자가 직접 만든 시크릿(secrets.tf external_secret_env)도 같은 방식으로 런타임 서비스 계정에만 읽기 권한을 준다
resource "google_secret_manager_secret_iam_member" "api_runtime_external" {
  for_each  = local.external_secret_env
  secret_id = data.google_secret_manager_secret.external[each.key].id
  role      = "roles/secretmanager.secretAccessor"
  member    = google_service_account.api_runtime.member
}

resource "google_cloud_run_v2_service" "api" {
  name     = var.api_service_name
  location = var.region
  ingress  = "INGRESS_TRAFFIC_ALL"

  scaling {
    min_instance_count = 0
    max_instance_count = 2
  }

  template {
    service_account                  = google_service_account.api_runtime.email
    timeout                          = "30s"
    max_instance_request_concurrency = 80

    scaling {
      min_instance_count = 0
      max_instance_count = 2
    }

    containers {
      # 첫 생성용 자리표시 이미지. 실제 이미지는 GitHub Actions가 배포한다.
      image = "us-docker.pkg.dev/cloudrun/container/hello"

      resources {
        limits = {
          cpu    = "1"
          memory = "512Mi"
        }
        cpu_idle          = true
        startup_cpu_boost = true
      }

      # 비밀이 아닌 설정. 화면과 API가 같은 origin(jinyeojeong.com)이다.
      env {
        name  = "WEB_BASE_URL"
        value = "https://${var.domain}"
      }

      env {
        name  = "KAKAO_REDIRECT_URI"
        value = "https://${var.domain}/api/auth/kakao/callback"
      }

      env {
        name  = "PAYMENT_PROVIDER"
        value = var.payment_provider
      }

      env {
        name  = "FEATURE_ACCOUNT_LINK"
        value = var.feature_account_link
      }

      # 거래 내역 파일 가져오기(W10 · W11): off | allowlist(관리자 페이지 기능 권한) | on. importKey 전용 키(IMPORT_KEY_HMAC_KEY)는 api_secret_env로 늘 붙는다
      env {
        name  = "FEATURE_FILE_IMPORT"
        value = var.feature_file_import
      }

      # 켤 파일 공급자(W11 알리페이는 목록에 더해야 켜진다)
      env {
        name  = "FILE_IMPORT_PROVIDERS"
        value = var.file_import_providers
      }

      # 카드 승인내역 불러오기(S8). CODEF 키는 enable_codef로 external_secret_env에 붙는다
      env {
        name  = "FEATURE_CARD_IMPORT"
        value = var.feature_card_import
      }

      # 현대·하나 카드번호 로그인(S8c). 약관 0.2 게시 전에는 false
      env {
        name  = "CARD_NUMBER_LOGIN"
        value = var.card_number_login ? "true" : "false"
      }

      env {
        name  = "CODEF_ENV"
        value = var.codef_env
      }

      env {
        name  = "CODEF_DAILY_CALL_BUDGET"
        value = tostring(var.codef_daily_call_budget)
      }

      dynamic "env" {
        for_each = length(var.card_import_allowed_user_ids) == 0 ? [] : [join(",", var.card_import_allowed_user_ids)]
        content {
          name  = "CARD_IMPORT_ALLOWED_USER_IDS"
          value = env.value
        }
      }

      env {
        name  = "INTERNAL_JOB_OIDC_AUDIENCE"
        value = var.internal_job_oidc_audience
      }

      env {
        name  = "INTERNAL_JOB_OIDC_SERVICE_ACCOUNT"
        value = google_service_account.scheduler.email
      }

      dynamic "env" {
        for_each = local.api_secret_env
        content {
          name = env.key
          value_source {
            secret_key_ref {
              secret  = google_secret_manager_secret.this[env.value].secret_id
              version = "latest"
            }
          }
        }
      }

      # 기능 플래그로 켠 외부 시크릿(KAKAO_ADMIN_KEY, EXIM_API_KEY, CODEF_*, ADMIN_*)
      dynamic "env" {
        for_each = local.external_secret_env
        content {
          name = env.key
          value_source {
            secret_key_ref {
              secret  = data.google_secret_manager_secret.external[env.key].secret_id
              version = "latest"
            }
          }
        }
      }

      dynamic "env" {
        for_each = var.kakao_app_id == "" ? [] : [var.kakao_app_id]
        content {
          name  = "KAKAO_APP_ID"
          value = env.value
        }
      }

      env {
        name = "DATABASE_URL"
        value_source {
          secret_key_ref {
            secret  = google_secret_manager_secret.this["database_url"].secret_id
            version = "latest"
          }
        }
      }

      env {
        name = "ORIGIN_SECRET"
        value_source {
          secret_key_ref {
            secret  = google_secret_manager_secret.this["origin_secret"].secret_id
            version = "latest"
          }
        }
      }

      volume_mounts {
        name       = "supabase-ca"
        mount_path = local.db_ca_mount_dir
      }
    }

    volumes {
      name = "supabase-ca"
      secret {
        secret = google_secret_manager_secret.this["supabase_ca"].secret_id
        items {
          version = "latest"
          path    = "ca.crt"
        }
      }
    }
  }

  lifecycle {
    ignore_changes = [
      client,
      client_version,
      template[0].containers[0].image,
    ]
  }

  depends_on = [
    google_project_service.this,
    google_secret_manager_secret_iam_member.api_runtime,
    google_secret_manager_secret_iam_member.api_runtime_external,
    google_secret_manager_secret_version.this,
  ]
}

resource "google_cloud_run_v2_service_iam_member" "api_public" {
  name     = google_cloud_run_v2_service.api.name
  location = google_cloud_run_v2_service.api.location
  role     = "roles/run.invoker"
  member   = "allUsers"
}
