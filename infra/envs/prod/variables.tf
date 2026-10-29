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
  description = "Cloudflare Email Routing으로 받는 도메인 별칭(cloudflare.tf). 여기로 온 메일을 support_forward_to로 전달한다. 약관·처리방침에 게시한 문의처는 운영자 Gmail(docs/legal/v1.0)이고 이 별칭은 싣지 않는다"
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

variable "feature_account_link" {
  description = "계좌·카드 자동 불러오기(토스 연결) 진입점을 화면에 보일지(GET /api/auth/session features.accountLink). 카드 내역 자동 수집은 마이데이터 허가 또는 허가받은 제휴사가 있어야 해 기본은 숨김(false). 연결 API는 그대로 동작한다"
  type        = string
  default     = "false"

  validation {
    condition     = contains(["true", "false"], var.feature_account_link)
    error_message = "feature_account_link는 true 또는 false여야 합니다."
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

# ── 사용자가 gcloud로 직접 만드는 시크릿(값·버전은 Terraform 밖). 시크릿을 만든 뒤에만 켠다 ──
# 끈 상태(기본)에서는 시크릿 조회·권한·Cloud Run env를 만들지 않으므로 시크릿이 없어도 plan·apply가 깨지지 않는다.

variable "enable_kakao_unlink" {
  description = "카카오 연결 끊기 알림 콜백. true면 Secret Manager yeojeong-kakao-admin-key를 KAKAO_ADMIN_KEY로 연결한다(시크릿이 먼저 있어야 한다)"
  type        = bool
  default     = false
}

variable "kakao_app_id" {
  description = "카카오 앱 ID(숫자, 비밀 아님). 비우지 않으면 KAKAO_APP_ID로 넘겨 연결 끊기 알림의 app_id도 확인한다"
  type        = string
  default     = ""

  validation {
    condition     = can(regex("^[0-9]*$", var.kakao_app_id))
    error_message = "kakao_app_id는 숫자여야 합니다."
  }
}

variable "enable_admin" {
  description = "운영자 관리자 페이지(/admin). true면 Secret Manager yeojeong-admin-username·yeojeong-admin-password-hash·yeojeong-admin-totp-secret을 ADMIN_USERNAME·ADMIN_PASSWORD_HASH·ADMIN_TOTP_SECRET으로 연결한다(시크릿 셋이 먼저 있어야 한다). 끄면(기본) /api/admin/* 전체가 404"
  type        = bool
  default     = false
}

variable "enable_exim_fx" {
  description = "한국수출입은행 환율. true면 Secret Manager yeojeong-exim-api-key를 EXIM_API_KEY로 연결한다(시크릿이 먼저 있어야 한다). 연결되면 환율 소스가 koreaexim+erapi(미고시 통화만 ExchangeRate-API)가 된다"
  type        = bool
  default     = false
}

# ── 카드 승인내역 불러오기(S8, CODEF 일회성 조회) ──

variable "enable_codef" {
  description = "CODEF 키 연결. true면 Secret Manager yeojeong-codef-client-id·yeojeong-codef-client-secret·yeojeong-codef-public-key를 CODEF_CLIENT_ID·CODEF_CLIENT_SECRET·CODEF_PUBLIC_KEY로 연결한다(시크릿이 먼저 있어야 한다). 키가 없으면 feature_card_import와 무관하게 기능이 꺼진다"
  type        = bool
  default     = false
}

variable "codef_env" {
  description = "CODEF 환경(CODEF_ENV): sandbox(고정 샘플) · development(데모 키, 실제 카드사) · production(정식 키)"
  type        = string
  default     = "sandbox"

  validation {
    condition     = contains(["sandbox", "development", "production"], var.codef_env)
    error_message = "codef_env는 sandbox, development, production 중 하나여야 합니다."
  }
}

variable "feature_card_import" {
  description = "카드 승인내역 불러오기 공개 단계(FEATURE_CARD_IMPORT): off(기본) · allowlist(card_import_allowed_user_ids 사용자만, 운영자 실테스트) · on(전체 공개 — 법률 자문 L-25 뒤에만)"
  type        = string
  default     = "off"

  validation {
    condition     = contains(["off", "allowlist", "on"], var.feature_card_import)
    error_message = "feature_card_import는 off, allowlist, on 중 하나여야 합니다."
  }
}

variable "card_import_allowed_user_ids" {
  description = "feature_card_import = allowlist일 때 켜 줄 사용자 ID(UUID) 목록(CARD_IMPORT_ALLOWED_USER_IDS). 비밀은 아니지만 terraform.tfvars로만 넣고 커밋하지 않는다"
  type        = list(string)
  default     = []

  validation {
    condition = alltrue([
      for id in var.card_import_allowed_user_ids :
      can(regex("^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$", id))
    ])
    error_message = "card_import_allowed_user_ids는 사용자 UUID 목록이어야 합니다."
  }
}

variable "codef_daily_call_budget" {
  description = "서비스 전체 CODEF API 일일 호출 예산(CODEF_DAILY_CALL_BUDGET, KST 날짜 기준). 계정 등록·조회·추가 인증·삭제를 모두 센다. 남은 예산이 4 미만이면 새 조회를 막는다(삭제는 항상 보낸다)"
  type        = number
  default     = 100

  validation {
    condition     = var.codef_daily_call_budget >= 0 && floor(var.codef_daily_call_budget) == var.codef_daily_call_budget
    error_message = "codef_daily_call_budget는 0 이상의 정수여야 합니다."
  }
}

