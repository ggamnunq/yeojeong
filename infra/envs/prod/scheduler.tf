resource "google_service_account" "scheduler" {
  account_id   = "yeojeong-scheduler"
  display_name = "yeojeong Cloud Scheduler"
}

# Scheduler의 신원으로 Cloud Run을 호출할 권한만 준다.
resource "google_cloud_run_v2_service_iam_member" "scheduler_invoker" {
  name     = google_cloud_run_v2_service.api.name
  location = google_cloud_run_v2_service.api.location
  role     = "roles/run.invoker"
  member   = google_service_account.scheduler.member
}

locals {
  scheduler_jobs = {
    auto_end = {
      description = "종료 시간이 지난 여정 자동 종료"
      schedule    = "*/5 * * * *"
      path        = "/api/internal/jobs/auto-end"
      paused      = false
    }
    sync = {
      description = "진행 중 여정 결제 동기화"
      schedule    = "*/10 * * * *"
      path        = "/api/internal/jobs/sync"
      paused      = false
    }
    fx = {
      description = "한국수출입은행 고시 근처 환율 수집"
      schedule    = "10 11,17 * * *"
      path        = "/api/internal/jobs/fx"
      paused      = false
    }
    settlements = {
      description = "종료됐지만 정산이 없는 여정 복구"
      schedule    = "15 * * * *"
      path        = "/api/internal/jobs/settlements"
      paused      = false
    }
    codef_cleanup = {
      description = "CODEF 계정 삭제 재시도(카드 승인내역 불러오기, account 모드에서만 행이 생긴다)"
      schedule    = "*/10 * * * *"
      path        = "/api/internal/jobs/codef-cleanup"
      paused      = !var.enable_codef
    }
    purge = {
      description = "보존 기간이 지난 데이터 파기"
      schedule    = "0 4 * * *"
      path        = "/api/internal/jobs/purge"
      paused      = false
    }
  }
}

resource "google_cloud_scheduler_job" "internal" {
  for_each = local.scheduler_jobs

  name             = "yeojeong-${replace(each.key, "_", "-")}"
  description      = each.value.description
  region           = var.region
  schedule         = each.value.schedule
  time_zone        = "Asia/Seoul"
  paused           = each.value.paused
  attempt_deadline = "30s"

  retry_config {
    retry_count          = 3
    min_backoff_duration = "5s"
    max_backoff_duration = "60s"
    max_doublings        = 3
  }

  http_target {
    http_method = "POST"
    uri         = "${google_cloud_run_v2_service.api.uri}${each.value.path}"
    body        = base64encode("{}")

    headers = {
      "Content-Type" = "application/json"
    }

    oidc_token {
      service_account_email = google_service_account.scheduler.email
      audience              = var.internal_job_oidc_audience
    }
  }

  lifecycle {
    precondition {
      condition     = var.internal_job_oidc_audience == google_cloud_run_v2_service.api.uri
      error_message = "internal_job_oidc_audience는 Cloud Run API URL과 정확히 같아야 합니다."
    }
  }

  depends_on = [
    google_cloud_run_v2_service_iam_member.scheduler_invoker,
    google_project_service.this["cloudscheduler.googleapis.com"],
  ]
}
