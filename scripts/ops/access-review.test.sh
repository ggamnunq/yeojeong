#!/usr/bin/env bash
# scripts/ops/access-review.sh 테스트. gcloud·tokeninfo(curl)는 가짜(PATH 앞에 둔다)로 바꾸고, 기록은 로컬 Postgres의 임시 _test DB에 쓴다.
#   TEST_DATABASE_URL=postgresql://yeojeong:yeojeong@localhost:5432/yeojeong_ops_test bash scripts/ops/access-review.test.sh
# TEST_DATABASE_URL이 없으면 인자 검사(접속 전 중단)만 본다. DB는 마이그레이션이 적용된 _test DB여야 한다(access_logs를 비운다).
# shellcheck disable=SC2015 # ok·ng는 실패하지 않는다
set -euo pipefail

here="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
script="$here/access-review.sh"
tmp="$(mktemp -d)"
trap 'rm -rf "$tmp"' EXIT
fail=0
ok() { echo "ok - $*"; }
ng() {
  echo "not ok - $*"
  fail=1
}

# 가짜 gcloud: 호출을 기록하고, 계정·시크릿을 돌려준다(설정 계정은 일부러 다른 값 — 토큰 주체를 써야 한다)
mkdir -p "$tmp/bin"
cat >"$tmp/bin/gcloud" <<'STUB'
#!/usr/bin/env bash
echo "$*" >>"$GCLOUD_CALLS"
case "$*" in
  "config get-value account") echo "config-account@example.com" ;;
  "auth print-access-token") echo "fake-access-token" ;;
  "secrets versions access latest --secret=yeojeong-direct-url"*) printf '%s' "$FAKE_DIRECT_URL" ;;
  *) exit 1 ;;
esac
STUB
chmod +x "$tmp/bin/gcloud"
cat >"$tmp/bin/curl" <<'STUB'
#!/usr/bin/env bash
case "$*" in *fake-access-token*) echo "token in argv" >&2; exit 1 ;; esac
body="$(cat)"
[ "$body" = "access_token=fake-access-token" ] || exit 1
printf '{\n  "email": "%s",\n  "email_verified": "%s"\n}\n' "$FAKE_TOKEN_EMAIL" "${FAKE_TOKEN_VERIFIED:-true}"
STUB
chmod +x "$tmp/bin/curl"
export PATH="$tmp/bin:$PATH" GCLOUD_CALLS="$tmp/calls" FAKE_TOKEN_EMAIL="reviewer@example.com" FAKE_DIRECT_URL="${TEST_DATABASE_URL:-postgresql://u:p@localhost:5432/none}"

expect_abort() {
  local name="$1"
  shift
  : >"$GCLOUD_CALLS"
  if out="$("$@" </dev/null 2>&1)"; then
    ng "$name: 멈춰야 한다"
  elif [ -s "$GCLOUD_CALLS" ]; then
    ng "$name: 인자 검사 전에 gcloud를 불렀다"
  else
    ok "$name ($out)"
  fi
}

expect_abort "모르는 결과" bash "$script" --result maybe
expect_abort "이상 있음인데 메모 없음" bash "$script" --result issue
expect_abort "여러 줄 메모" bash "$script" --result ok --note $'a\nb'
expect_abort "너무 긴 메모" bash "$script" --result ok --note "$(printf 'x%.0s' $(seq 1 501))"
expect_abort "잘못된 --since" bash "$script" --since 2026/10/01
expect_abort "값 없는 인자" bash "$script" --note
expect_abort "모르는 인자" bash "$script" --nope

: >"$GCLOUD_CALLS"
if FAKE_TOKEN_VERIFIED=false bash "$script" --result ok </dev/null >/dev/null 2>&1; then ng "미확인 이메일인데 진행"
elif grep -q "secrets" "$GCLOUD_CALLS"; then ng "미확인 이메일인데 시크릿을 읽었다"
else ok "미확인 이메일이면 시크릿을 읽기 전에 중단"; fi

if [ -z "${TEST_DATABASE_URL:-}" ]; then
  echo "# TEST_DATABASE_URL이 없어 접속·기록 테스트는 건너뜀"
  exit "$fail"
fi
case "$TEST_DATABASE_URL" in
  *_test) ;;
  *)
    echo "TEST_DATABASE_URL은 _test DB여야 합니다" >&2
    exit 2
    ;;
esac

q() { psql -X -q -t -A "$TEST_DATABASE_URL" -c "$1"; }
q "DELETE FROM access_logs WHERE action LIKE 'ADMIN\_%' OR action LIKE 'OPERATOR\_%'"

# 기록 심기: 기간 안(이틀 전) 관리자 로그인·열람·실패 3건, DB 접속 짝 1·END 없음 1·START 없음 1. 기간 밖(100일 전) 로그인 1
admin="'00000000-0000-4000-8000-0000000000ad'::uuid"
op="md5('operator:someone@example.com')::uuid"
q "INSERT INTO access_logs (user_id, action, resource_type, client_ip, details, at) VALUES
  ($admin, 'ADMIN_LOGIN', 'ADMIN', '203.0.113.9', NULL, now() - interval '2 days'),
  ($admin, 'ADMIN_VIEW_USER', 'USER', '203.0.113.9', NULL, now() - interval '2 days'),
  ($admin, 'ADMIN_LOGIN_FAILED', 'ADMIN', '198.51.100.7', '{\"reason\": \"BAD_CREDENTIALS\"}', now() - interval '2 days'),
  ($admin, 'ADMIN_LOGIN_FAILED', 'ADMIN', '198.51.100.7', '{\"reason\": \"BAD_CREDENTIALS\"}', now() - interval '2 days'),
  ($admin, 'ADMIN_LOGIN_FAILED', 'ADMIN', '198.51.100.7', '{\"reason\": \"RATE_LIMITED\"}', now() - interval '2 days'),
  ($admin, 'ADMIN_LOGIN', 'ADMIN', '192.0.2.44', NULL, now() - interval '100 days')"
q "INSERT INTO access_logs (user_id, action, resource_type, request_id, ua, details, at) VALUES
  ($op, 'OPERATOR_DB_ACCESS_START', 'DATABASE', 'opdb:pair', 'scripts/ops/db-connect.sh', '{\"operator\": \"someone@example.com\", \"reason\": \"장애 조사 #1\", \"host\": \"mac\"}', now() - interval '3 days'),
  ($op, 'OPERATOR_DB_ACCESS_END', 'DATABASE', 'opdb:pair', 'scripts/ops/db-connect.sh', '{\"operator\": \"someone@example.com\", \"reason\": \"장애 조사 #1\", \"host\": \"mac\", \"exitStatus\": 0}', now() - interval '3 days' + interval '5 minutes'),
  ($op, 'OPERATOR_DB_ACCESS_START', 'DATABASE', 'opdb:no-end', 'scripts/ops/db-connect.sh', '{\"operator\": \"someone@example.com\", \"reason\": \"복구\", \"host\": \"mac\"}', now() - interval '1 day'),
  ($op, 'OPERATOR_DB_ACCESS_END', 'DATABASE', 'opdb:no-start', 'manual', '{\"operator\": \"someone@example.com\", \"reason\": \"?\", \"host\": \"mac\", \"exitStatus\": 0}', now() - interval '1 day')"

# 1) 첫 점검(지난 기록 없음 → 지난달 1일 KST부터), 묻지 않고 기록. 메모의 따옴표는 그대로 저장된다(SQL 인젝션 없음)
note="GCP 감사 로그 대조 완료 '); DROP TABLE users; --"
out="$(bash "$script" --result ok --note "$note" </dev/null 2>"$tmp/err")" && status=0 || status=$?
[ "$status" -eq 0 ] && ok "첫 점검 종료 코드 0" || ng "종료 코드 $status: $(cat "$tmp/err")"
if printf '%s\n%s\n' "$out" "$(cat "$tmp/err")" | grep -q "postgres\(ql\)\?://"; then ng "연결 문자열이 화면에 나왔다"; else ok "연결 문자열을 화면에 내지 않는다"; fi
grep -q "203.0.113.9" <<<"$out" && grep -q "198.51.100.7" <<<"$out" && ok "관리자 접근 client_ip별 요약" || ng "client_ip 요약 없음: $out"
grep -q "BAD_CREDENTIALS" <<<"$out" && grep -q "RATE_LIMITED" <<<"$out" && ok "로그인 실패 사유별 요약" || ng "로그인 실패 요약"
grep -q "처음 보는 IP" <<<"$out" && ok "처음 보는 IP 표시" || ng "처음 보는 IP 표시 없음"
grep -q "192.0.2.44" <<<"$out" && ng "기간 밖 기록이 나왔다" || ok "기간 밖(100일 전) 기록은 빼고 본다"
grep -q "opdb:no-end.*END 없음" <<<"$out" && ok "END 없는 START 표시" || ng "END 없음 표시"
grep -q "opdb:no-start.*START 없음" <<<"$out" && ok "START 없는 END 표시" || ng "START 없음 표시"
grep -q "요약: 관리자 접근 5건(IP 2개) · 로그인 실패 3건 · DB 직접 접속 2회 · END 없음 1 · START 없음 1" <<<"$out" && ok "요약 한 줄" || ng "요약 줄: $(grep 요약 <<<"$out")"
grep -q "callerIp" <<<"$out" && grep -q 'timestamp>="' <<<"$out" && ok "GCP 감사 로그 대조 명령(기간 채움)" || ng "GCP 감사 로그 명령 없음"

review="$(q "SELECT (details->>'operator') || '|' || (details->>'result') || '|' || (details->>'note') || '|' || (details->>'host' <> '') || '|' || request_id || '|' || ua || '|' || resource_type || '|' || (user_id = md5('operator:reviewer@example.com')::uuid) FROM access_logs WHERE action = 'OPERATOR_ACCESS_REVIEW'")"
[ "$review" = "reviewer@example.com|OK|${note}|true|$(cut -d'|' -f5 <<<"$review")|scripts/ops/access-review.sh|DATABASE|true" ] &&
  [[ "$(cut -d'|' -f5 <<<"$review")" == opdb:* ]] && ok "OPERATOR_ACCESS_REVIEW 기록(점검자 = 토큰 주체, 결과·메모 그대로)" || ng "점검 기록: $review"
[ "$(q "SELECT count(*) FROM users")" -ge 0 ] && ok "users 테이블 그대로"
summary="$(q "SELECT details->'summary' FROM access_logs WHERE action = 'OPERATOR_ACCESS_REVIEW'")"
[ "$summary" = '{"dbSessions": 2, "adminEvents": 5, "adminClientIps": 2, "adminLoginFailed": 3, "dbEndWithoutStart": 1, "dbStartWithoutEnd": 1}' ] && ok "건수 요약 저장" || ng "summary: $summary"
[ "$(q "SELECT (details->>'periodStart')::timestamptz = (date_trunc('month', now() AT TIME ZONE 'Asia/Seoul') - interval '1 month') AT TIME ZONE 'Asia/Seoul' FROM access_logs WHERE action = 'OPERATOR_ACCESS_REVIEW'")" = t ] &&
  ok "첫 점검 기간 시작 = 지난달 1일 0시(KST)" || ng "periodStart"
sid="$(q "SELECT request_id FROM access_logs WHERE action = 'OPERATOR_ACCESS_REVIEW'")"
[ "$(q "SELECT string_agg(action, ',' ORDER BY at, action DESC) FROM access_logs WHERE request_id = '$sid'")" = "OPERATOR_DB_ACCESS_START,OPERATOR_ACCESS_REVIEW,OPERATOR_DB_ACCESS_END" ] &&
  ok "점검 세션도 START → 점검 기록 → END(같은 request_id)" || ng "세션 기록: $(q "SELECT string_agg(action, ',' ORDER BY at) FROM access_logs WHERE request_id = '$sid'")"
[ "$(q "SELECT details->>'reason' FROM access_logs WHERE request_id = '$sid' AND action = 'OPERATOR_DB_ACCESS_START'")" = "월간 접속기록 점검" ] && ok "점검 세션 사유" || ng "점검 세션 사유"
[ "$(q "SELECT (r.details->>'periodEnd')::timestamptz = s.at FROM access_logs r JOIN access_logs s ON s.request_id = r.request_id AND s.action = 'OPERATOR_DB_ACCESS_START' WHERE r.action = 'OPERATOR_ACCESS_REVIEW'")" = t ] &&
  ok "기간 끝 = 이번 점검 접속 시작(자기 세션은 다음 점검으로)" || ng "periodEnd"

# 2) 결과를 받지 못하면(대화형 아님 · --result 없음) 기록하지 않고 3. 접속 기록(START·END)은 남는다
before="$(q "SELECT count(*) FROM access_logs WHERE action = 'OPERATOR_ACCESS_REVIEW'")"
out2="$(bash "$script" </dev/null 2>"$tmp/err2")" && status=0 || status=$?
[ "$status" -eq 3 ] && ok "결과 없으면 종료 코드 3" || ng "종료 코드 $status: $(cat "$tmp/err2")"
[ "$(q "SELECT count(*) FROM access_logs WHERE action = 'OPERATOR_ACCESS_REVIEW'")" = "$before" ] && ok "결과 없으면 점검 기록 없음" || ng "기록이 생겼다"
# 지난 점검 이후만 본다 — 심은 기록은 빠지고, 지난 점검 세션(START = 지난 periodEnd)만 DB 직접 접속 1회로 보인다
grep -q "요약: 관리자 접근 0건(IP 0개) · 로그인 실패 0건 · DB 직접 접속 1회 · END 없음 0 · START 없음 0" <<<"$out2" && ok "두 번째 점검은 지난 점검 이후만 본다(지난 점검 세션 1회)" || ng "두 번째 요약: $(grep 요약 <<<"$out2")"

# 3) 이상 있음 + 메모. 기록하지 않은 점검(2)은 기간을 옮기지 않는다 — 기간 시작 = 첫 점검의 periodEnd, 점검 세션 (1)·(2)가 DB 직접 접속 2회로 보인다
out3="$(bash "$script" --result issue --note "#77 낯선 IP 확인 중" </dev/null 2>"$tmp/err3")" && status=0 || status=$?
[ "$status" -eq 0 ] && ok "이상 있음 기록 종료 코드 0" || ng "종료 코드 $status: $(cat "$tmp/err3")"
grep -q "DB 직접 접속 2회 · END 없음 0 · START 없음 0" <<<"$out3" && grep -q "월간 접속기록 점검" <<<"$out3" && ok "앞 점검 세션도 DB 직접 접속으로 보인다" || ng "세 번째 요약: $(grep 요약 <<<"$out3")"
[ "$(q "SELECT (b.details->>'periodStart') = (a.details->>'periodEnd') AND b.details->>'result' = 'ISSUE' AND b.details->>'note' = '#77 낯선 IP 확인 중'
        FROM access_logs a, access_logs b WHERE a.action = 'OPERATOR_ACCESS_REVIEW' AND b.action = 'OPERATOR_ACCESS_REVIEW' AND b.at > a.at")" = t ] &&
  ok "다음 점검 기간은 지난 점검 끝에서 이어진다 · ISSUE·메모" || ng "이어지는 기간"

# 4) --since로 기간을 직접 정하면 그 날짜(KST 0시)부터
out4="$(bash "$script" --since 2000-01-01 </dev/null 2>/dev/null)" || true
grep -q "점검 기간(KST): 2000-01-01 00:00 ~" <<<"$out4" && grep -q "192.0.2.44" <<<"$out4" && ok "--since 2000-01-01이면 오래된 기록도 본다" || ng "--since: $(grep 기간 <<<"$out4")"

q "DELETE FROM access_logs WHERE action LIKE 'ADMIN\_%' OR action LIKE 'OPERATOR\_%'"
exit "$fail"
