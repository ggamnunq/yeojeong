resource "google_project" "this" {
  project_id      = var.project_id
  name            = "yeojeong"
  billing_account = var.billing_account
  deletion_policy = "PREVENT"
}

resource "google_project_service" "storage" {
  project            = google_project.this.project_id
  service            = "storage.googleapis.com"
  disable_on_destroy = false
}

# envs/* 의 Terraform state 저장소
resource "google_storage_bucket" "tfstate" {
  project                     = google_project.this.project_id
  name                        = "${var.project_id}-tfstate"
  location                    = var.region
  storage_class               = "STANDARD"
  uniform_bucket_level_access = true
  public_access_prevention    = "enforced"

  versioning {
    enabled = true
  }

  lifecycle_rule {
    condition {
      num_newer_versions = 10
      with_state         = "ARCHIVED"
    }
    action {
      type = "Delete"
    }
  }

  depends_on = [google_project_service.storage]
}
