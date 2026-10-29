# 애플리케이션 로그 보존(기능명세 8-1·8-7, docs/legal README 6-4 #2).
# _Default 버킷의 기본값(30일·global)을 쓰지 않고 서울 버킷에 3개월 이상 둔다(통신비밀보호법 접속 기록 3개월).
# 감사 로그(Admin Activity 등)는 지금처럼 _Required 버킷(global, 400일)에 남고, 서울 감사 버킷(아래)에도 사본을 둔다.

locals {
  # 어떤 달력 3개월(최대 92일)도 덮도록 93일
  app_log_retention_days = 93
}

resource "google_logging_project_bucket_config" "app" {
  project        = var.project_id
  location       = var.region
  bucket_id      = "yeojeong-app-logs"
  retention_days = local.app_log_retention_days
  description    = "Cloud Run 등 애플리케이션 로그 (서울, 93일)"

  depends_on = [google_project_service.this]
}

# 프로젝트마다 자동으로 있는 _Default 싱크를 가져와 목적지만 서울 버킷으로 바꾼다(필터는 GCP 기본값 그대로).
import {
  to = google_logging_project_sink.default
  id = "projects/${var.project_id}/sinks/_Default"
}

resource "google_logging_project_sink" "default" {
  name        = "_Default"
  destination = "logging.googleapis.com/${google_logging_project_bucket_config.app.id}"
  filter      = "NOT LOG_ID(\"cloudaudit.googleapis.com/activity\") AND NOT LOG_ID(\"externalaudit.googleapis.com/activity\") AND NOT LOG_ID(\"cloudaudit.googleapis.com/system_event\") AND NOT LOG_ID(\"externalaudit.googleapis.com/system_event\") AND NOT LOG_ID(\"cloudaudit.googleapis.com/access_transparency\") AND NOT LOG_ID(\"externalaudit.googleapis.com/access_transparency\")"

  # Data Access 감사 로그는 아래 감사 버킷(1년 이상)에만 둔다. 같은 로그를 앱 버킷에 한 번 더 쌓지 않는다.
  exclusions {
    name        = "data-access-audit"
    description = "Data Access 감사 로그는 yeojeong-audit-logs 싱크가 받는다"
    filter      = "LOG_ID(\"cloudaudit.googleapis.com/data_access\")"
  }

  # GCP가 만든 값 그대로. 같은 프로젝트의 로그 버킷이라 쓰기 권한을 따로 주지 않아도 된다
  unique_writer_identity = true
}

# ── 개인정보취급자 접속 기록(기능명세 L-3b, docs/legal README 6-4 #3, 처리방침 제3조) ──
# 「개인정보의 안전성 확보조치 기준」 접속기록 1년 이상. 운영자가 GCP에서 비밀값(DB 비밀번호·키)을 꺼내거나
# Terraform state(DB 비밀번호 포함)를 읽거나 로그(접속 IP 포함)를 조회한 기록을 서울 버킷에 남긴다.
# 앱 사용자의 금융정보 접근 기록은 DB access_logs(1년, 파기 배치 9단계)가 따로 맡는다.

locals {
  # 1년(윤년 366일)을 넘기고 _Required 버킷(400일)과 맞춘다
  audit_log_retention_days = 400

  # Data Access 감사 로그는 기본으로 꺼져 있다. 운영자 접근이 남는 서비스만 켜서 양을 작게 유지한다.
  data_access_audit_services = {
    # 비밀값 열람(AccessSecretVersion). Cloud Run 인스턴스 시작 때 런타임 SA의 읽기도 남는다
    "secretmanager.googleapis.com" = ["ADMIN_READ", "DATA_READ", "DATA_WRITE"]
    # 서비스·리비전 설정(env, 시크릿 연결) 조회
    "run.googleapis.com" = ["ADMIN_READ", "DATA_READ", "DATA_WRITE"]
    # 서비스 계정 가장(GitHub Actions WIF 배포, 사람이 SA로 토큰 발급).
    # iamcredentials.googleapis.com은 서비스 단위 감사 설정을 받지 않는다 — IAM API 설정이 함께 다룬다.
    "iam.googleapis.com" = ["DATA_READ"]
    # Terraform state 버킷 읽기·쓰기(state에 DB 비밀번호가 들어 있다)
    "storage.googleapis.com" = ["DATA_READ", "DATA_WRITE"]
    # 로그 조회. 앱 로그에 접속 IP가 있다
    "logging.googleapis.com" = ["DATA_READ"]
  }
}

resource "google_project_iam_audit_config" "data_access" {
  for_each = local.data_access_audit_services
  project  = var.project_id
  service  = each.key

  dynamic "audit_log_config" {
    for_each = each.value
    content {
      log_type = audit_log_config.value
    }
  }
}

resource "google_logging_project_bucket_config" "audit" {
  project        = var.project_id
  location       = var.region
  bucket_id      = "yeojeong-audit-logs"
  retention_days = local.audit_log_retention_days
  description    = "감사 로그 사본(Admin Activity·Data Access) (서울, 400일)"
  # 잠그면 보존 기간을 줄이거나 버킷을 지울 수 없다(되돌릴 수 없음). 적용하고 로그 유입을 확인한 뒤 운영자가 켠다.
  locked = var.audit_log_bucket_locked

  lifecycle {
    prevent_destroy = true
  }

  depends_on = [google_project_service.this]
}

# Admin Activity는 _Required(global, 400일)에도 남지만 서울 보관을 위해 사본을 둔다.
resource "google_logging_project_sink" "audit" {
  name        = "yeojeong-audit-logs"
  description = "감사 로그를 서울 감사 버킷으로(개인정보취급자 접속 기록 1년)"
  destination = "logging.googleapis.com/${google_logging_project_bucket_config.audit.id}"
  filter      = "LOG_ID(\"cloudaudit.googleapis.com/activity\") OR LOG_ID(\"cloudaudit.googleapis.com/data_access\")"

  # 같은 프로젝트의 로그 버킷이라 쓰기 권한을 따로 주지 않아도 된다
  unique_writer_identity = true
}
