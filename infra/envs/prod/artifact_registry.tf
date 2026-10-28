resource "google_artifact_registry_repository" "app" {
  repository_id = "yeojeong"
  location      = var.region
  format        = "DOCKER"

  # 무료 저장 용량(0.5GB) 안에 들도록 최근 이미지 3개만 남긴다
  cleanup_policy_dry_run = false

  cleanup_policies {
    id     = "keep-recent"
    action = "KEEP"
    most_recent_versions {
      keep_count = 3
    }
  }

  cleanup_policies {
    id     = "delete-older"
    action = "DELETE"
    condition {
      tag_state  = "ANY"
      older_than = "86400s"
    }
  }

  depends_on = [google_project_service.this]
}
