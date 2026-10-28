variable "project_id" {
  description = "새로 만들 GCP 프로젝트 ID (전역에서 유일해야 함)"
  type        = string
}

variable "billing_account" {
  description = "프로젝트에 연결할 결제 계정 ID"
  type        = string
  sensitive   = true
}

variable "region" {
  type    = string
  default = "asia-northeast3"
}
