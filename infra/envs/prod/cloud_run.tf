resource "google_service_account" "api_runtime" {
  account_id   = "yeojeong-api-runtime"
  display_name = "yeojeong API runtime (Cloud Run)"
}

resource "google_secret_manager_secret_iam_member" "api_runtime" {
  for_each  = toset(["database_url", "supabase_ca", "origin_secret"])
  secret_id = google_secret_manager_secret.this[each.value].id
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
    google_secret_manager_secret_version.this,
  ]
}

resource "google_cloud_run_v2_service_iam_member" "api_public" {
  name     = google_cloud_run_v2_service.api.name
  location = google_cloud_run_v2_service.api.location
  role     = "roles/run.invoker"
  member   = "allUsers"
}
