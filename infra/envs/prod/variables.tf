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

variable "cloudflare_account_id" {
  type = string
}

variable "domain" {
  type    = string
  default = "jinyeojeong.com"
}

variable "web_worker_name" {
  type    = string
  default = "yeojeong-web"
}

variable "kakao_client_id" {
  description = "카카오 REST API 키(terraform.tfvars 또는 TF_VAR_kakao_client_id, 커밋 금지)"
  type        = string
  sensitive   = true
}

variable "kakao_client_secret" {
  description = "카카오 로그인 클라이언트 시크릿(terraform.tfvars 또는 TF_VAR_kakao_client_secret, 커밋 금지)"
  type        = string
  sensitive   = true
}

variable "support_email" {
  description = "탈퇴·삭제 요청 메일 초안의 받는 주소. 임시값이라 아직 메일을 받지 못한다(출시 전 교체)"
  type        = string
  default     = "support@jinyeojeong.com"
}
