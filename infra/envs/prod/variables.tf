variable "project_id" {
  type = string
}

variable "region" {
  type    = string
  default = "asia-northeast3"
}

variable "billing_account" {
  description = "예산 알림을 걸 결제 계정 ID"
  type        = string
  sensitive   = true
}

variable "monthly_budget_krw" {
  description = "월 예산 알림 기준 금액 (원)"
  type        = number
  default     = 7000
}

variable "api_service_name" {
  type    = string
  default = "yeojeong-api"
}

variable "supabase_organization_id" {
  description = "Supabase 조직 slug"
  type        = string
}

variable "supabase_region" {
  type    = string
  default = "ap-northeast-2"
}

variable "github_repository_id" {
  description = "배포를 허용할 GitHub 레포의 숫자 ID (gh api repos/OWNER/REPO --jq .id)"
  type        = string
}

variable "github_repository_owner_id" {
  description = "레포 소유자의 숫자 ID (gh api repos/OWNER/REPO --jq .owner.id)"
  type        = string
}
