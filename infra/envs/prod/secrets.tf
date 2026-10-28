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
