# GitHub Actions가 서비스 계정 키 없이 OIDC 토큰으로 배포하도록 Workload Identity Federation을 쓴다
resource "google_iam_workload_identity_pool" "github" {
  workload_identity_pool_id = "github"
  display_name              = "GitHub Actions"

  depends_on = [google_project_service.this]
}

resource "google_iam_workload_identity_pool_provider" "github" {
  workload_identity_pool_id          = google_iam_workload_identity_pool.github.workload_identity_pool_id
  workload_identity_pool_provider_id = "yeojeong"
  display_name                       = "yeojeong repo"

  attribute_mapping = {
    "google.subject"                = "assertion.sub"
    "attribute.repository_id"       = "assertion.repository_id"
    "attribute.repository_owner_id" = "assertion.repository_owner_id"
    "attribute.ref"                 = "assertion.ref"
  }

  # 레포 이름 대신 바뀌지 않는 숫자 ID로 묶고, main 브랜치에서 온 토큰만 받는다
  attribute_condition = join(" && ", [
    "assertion.repository_id == '${var.github_repository_id}'",
    "assertion.repository_owner_id == '${var.github_repository_owner_id}'",
    "assertion.ref == 'refs/heads/main'",
  ])

  oidc {
    issuer_uri = "https://token.actions.githubusercontent.com"
  }
}

resource "google_service_account" "api_deployer" {
  account_id   = "yeojeong-api-deployer"
  display_name = "yeojeong API deployer (GitHub Actions)"
}

resource "google_service_account_iam_member" "api_deployer_wif" {
  service_account_id = google_service_account.api_deployer.name
  role               = "roles/iam.workloadIdentityUser"
  member             = "principalSet://iam.googleapis.com/${google_iam_workload_identity_pool.github.name}/attribute.repository_id/${var.github_repository_id}"
}

# 아래 권한은 모두 프로젝트 전체가 아니라 개별 리소스 단위로 준다
resource "google_artifact_registry_repository_iam_member" "api_deployer" {
  repository = google_artifact_registry_repository.app.name
  location   = google_artifact_registry_repository.app.location
  role       = "roles/artifactregistry.writer"
  member     = google_service_account.api_deployer.member
}

resource "google_cloud_run_v2_service_iam_member" "api_deployer" {
  name     = google_cloud_run_v2_service.api.name
  location = google_cloud_run_v2_service.api.location
  role     = "roles/run.developer"
  member   = google_service_account.api_deployer.member
}

resource "google_service_account_iam_member" "api_deployer_act_as_runtime" {
  service_account_id = google_service_account.api_runtime.name
  role               = "roles/iam.serviceAccountUser"
  member             = google_service_account.api_deployer.member
}
