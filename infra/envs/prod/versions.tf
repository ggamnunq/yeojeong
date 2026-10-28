terraform {
  required_version = ">= 1.10"

  backend "gcs" {
    prefix = "envs/prod"
  }

  required_providers {
    google = {
      source  = "hashicorp/google"
      version = "~> 8.9"
    }
    supabase = {
      source  = "supabase/supabase"
      version = "~> 1.11"
    }
    random = {
      source  = "hashicorp/random"
      version = "~> 3.9"
    }
    cloudflare = {
      source  = "cloudflare/cloudflare"
      version = "~> 5.28"
    }
  }
}

provider "google" {
  project = var.project_id
  region  = var.region
}

# Budget API는 사용자 인증으로 호출할 때 quota project가 필요하다
provider "google" {
  alias                 = "billing"
  project               = var.project_id
  region                = var.region
  user_project_override = true
  billing_project       = var.project_id
}

# 토큰은 SUPABASE_ACCESS_TOKEN 환경변수로 받는다
provider "supabase" {}

# 토큰은 CLOUDFLARE_API_TOKEN 환경변수로 받는다 (jinyeojeong.com zone + 계정 Workers 권한만 가진 토큰)
provider "cloudflare" {}
