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

variable "internal_job_oidc_audience" {
  description = "Cloud Scheduler OIDC aud. terraform output api_url과 정확히 같은 Cloud Run 서비스 URL"
  type        = string
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
  description = "고객센터 주소. Cloud Run env SUPPORT_EMAIL(탈퇴·삭제 요청 메일 초안의 받는 주소)이자 Cloudflare Email Routing이 support_forward_to로 전달하는 주소(cloudflare.tf)"
  type        = string
  default     = "support@jinyeojeong.com"
}

variable "payment_provider" {
  description = "결제 데이터 제공자. toss = 실제 토스 연동(계약 전이라 미구현, 연결 시작이 503), demo = 샘플 데이터 어댑터. 출시 전 테스트 기간에만 demo를 쓰고, 정식 연동 때 toss로 되돌리며 데모로 만든 결제수단·결제를 정리한다"
  type        = string
  default     = "toss"

  validation {
    condition     = contains(["toss", "demo"], var.payment_provider)
    error_message = "payment_provider는 toss 또는 demo여야 합니다."
  }
}

variable "support_forward_to" {
  description = "support_email로 온 메일을 전달받을 운영자 주소(terraform.tfvars 또는 TF_VAR_support_forward_to, 커밋 금지). Cloudflare가 보내는 확인 메일을 한 번 눌러야 전달이 시작된다"
  type        = string
  sensitive   = true

  validation {
    condition     = can(regex("^[^@[:space:]]+@[^@[:space:]]+\\.[^@[:space:]]+$", var.support_forward_to))
    error_message = "support_forward_to는 메일 주소 형식이어야 합니다."
  }
}

variable "audit_log_bucket_locked" {
  description = "감사 로그 버킷(yeojeong-audit-logs) 보존 잠금. true로 바꾸면 되돌릴 수 없다(보존 기간 축소·버킷 삭제 불가). 첫 적용 뒤 로그 유입을 확인하고 켠다"
  type        = bool
  default     = false
}
