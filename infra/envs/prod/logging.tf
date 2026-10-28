# 애플리케이션 로그 보존(기능명세 8-1·8-7, docs/legal README 6-4 #2).
# _Default 버킷의 기본값(30일·global)을 쓰지 않고 서울 버킷에 3개월 이상 둔다(통신비밀보호법 접속 기록 3개월).
# 감사 로그(Admin Activity 등)는 지금처럼 _Required 버킷(400일)에 남는다.

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

  # GCP가 만든 값 그대로. 같은 프로젝트의 로그 버킷이라 쓰기 권한을 따로 주지 않아도 된다
  unique_writer_identity = true
}
