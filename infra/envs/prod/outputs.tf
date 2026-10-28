output "api_url" {
  value = google_cloud_run_v2_service.api.uri
}

output "artifact_registry" {
  value = "${google_artifact_registry_repository.app.location}-docker.pkg.dev/${var.project_id}/${google_artifact_registry_repository.app.repository_id}"
}

output "supabase_project_ref" {
  value = supabase_project.prod.id
}

# GitHub 레포 변수(gh variable set)로 넣는 값들
output "github_variables" {
  value = {
    GCP_PROJECT_ID    = var.project_id
    GCP_REGION        = var.region
    GCP_WIF_PROVIDER  = google_iam_workload_identity_pool_provider.github.name
    GCP_DEPLOY_SA     = google_service_account.api_deployer.email
    GAR_REPOSITORY    = google_artifact_registry_repository.app.repository_id
    CLOUD_RUN_SERVICE = google_cloud_run_v2_service.api.name
  }
}
