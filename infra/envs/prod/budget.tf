data "google_project" "this" {}

# 알림만 보낸다. 실제 비용 상한은 Cloud Run 최대 인스턴스 수, Artifact Registry 정리 정책, Supabase Free 플랜으로 건다.
resource "google_billing_budget" "monthly" {
  provider        = google.billing
  billing_account = var.billing_account
  display_name    = "yeojeong monthly"

  budget_filter {
    projects        = ["projects/${data.google_project.this.number}"]
    calendar_period = "MONTH"
  }

  amount {
    specified_amount {
      currency_code = "KRW"
      units         = tostring(var.monthly_budget_krw)
    }
  }

  threshold_rules {
    threshold_percent = 0.5
  }
  threshold_rules {
    threshold_percent = 0.9
  }
  threshold_rules {
    threshold_percent = 1.0
  }
  threshold_rules {
    threshold_percent = 1.0
    spend_basis       = "FORECASTED_SPEND"
  }

  depends_on = [google_project_service.this]
}
