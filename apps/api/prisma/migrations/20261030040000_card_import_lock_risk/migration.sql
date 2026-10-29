-- 현대·하나 카드번호 로그인(S8c) 잠김 위험 카운터: 사용자·기관별, 성공해야 0(행은 7일 파기 배치). 내용(카드번호·비밀번호) 없음
ALTER TABLE "card_import_login_failures"
  ADD COLUMN "lock_risk_failures" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN "lock_risk_last_failed_at" TIMESTAMPTZ;
