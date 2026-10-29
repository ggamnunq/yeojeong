#!/usr/bin/env bash
# scripts/ops/db-connect.sh 테스트. gcloud는 가짜(PATH 앞에 둔다)로 바꾸고, 접근 기록은 로컬 Postgres의 임시 _test DB에 쓴다.
#   TEST_DATABASE_URL=postgresql://yeojeong:yeojeong@localhost:5432/yeojeong_ops_test bash scripts/ops/db-connect.test.sh
# TEST_DATABASE_URL이 없으면 사유 검사(접속 전 중단)만 본다. DB는 마이그레이션이 적용된 _test DB여야 한다.
# shellcheck disable=SC2015 # ok·ng는 실패하지 않는다
set -euo pipefail

here="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
script="$here/db-connect.sh"
tmp="$(mktemp -d)"
trap 'rm -rf "$tmp"' EXIT
fail=0
ok() { echo "ok - $*"; }
ng() {
  echo "not ok - $*"
  fail=1
}

# 가짜 gcloud: 호출을 기록하고, 계정·시크릿을 돌려준다
mkdir -p "$tmp/bin"
cat >"$tmp/bin/gcloud" <<'STUB'
#!/usr/bin/env bash
echo "$*" >>"$GCLOUD_CALLS"
case "$*" in
  # 설정 값은 일부러 다른 계정 — 스크립트는 이 값을 믿지 말고 토큰 주체(tokeninfo)를 써야 한다
  "config get-value account") echo "config-account@example.com" ;;
  "auth print-access-token") echo "fake-access-token" ;;
  "secrets versions access latest --secret=yeojeong-direct-url"*) printf '%s' "$FAKE_DIRECT_URL" ;;
  *) exit 1 ;;
esac
STUB
chmod +x "$tmp/bin/gcloud"
# 가짜 curl(tokeninfo): 토큰은 표준입력으로만 받아야 한다(인자에 있으면 실패)
cat >"$tmp/bin/curl" <<'STUB'
#!/usr/bin/env bash
case "$*" in *fake-access-token*) echo "token in argv" >&2; exit 1 ;; esac
body="$(cat)"
[ "$body" = "access_token=fake-access-token" ] || exit 1
printf '{\n  "azp": "x",\n  "email": "%s",\n  "email_verified": "%s",\n  "expires_in": "3599"\n}\n' "$FAKE_TOKEN_EMAIL" "${FAKE_TOKEN_VERIFIED:-true}"
STUB
chmod +x "$tmp/bin/curl"
export PATH="$tmp/bin:$PATH" GCLOUD_CALLS="$tmp/calls" FAKE_TOKEN_EMAIL="operator@example.com" FAKE_DIRECT_URL="${TEST_DATABASE_URL:-postgresql://u:p@localhost:5432/none}"

expect_abort() {
  local name="$1"
  shift
  : >"$GCLOUD_CALLS"
  if out="$("$@" </dev/null 2>&1)"; then
    ng "$name: 멈춰야 한다"
  elif [ -s "$GCLOUD_CALLS" ]; then
    ng "$name: 사유 검사 전에 gcloud를 불렀다"
  else
    ok "$name ($out)"
  fi
}

expect_abort "사유 없음" bash "$script"
expect_abort "빈 사유" bash "$script" --reason ""
expect_abort "공백 사유" bash "$script" --reason "   "
expect_abort "여러 줄 사유" bash "$script" --reason $'a\nb'
expect_abort "너무 긴 사유" bash "$script" --reason "$(printf 'x%.0s' $(seq 1 201))"
expect_abort "모르는 인자" bash "$script" --nope

# 토큰 주체의 이메일이 확인되지 않았으면(또는 없으면) 시크릿을 읽기 전에 멈춘다
: >"$GCLOUD_CALLS"
if FAKE_TOKEN_VERIFIED=false bash "$script" --reason "x" </dev/null >/dev/null 2>&1; then ng "미확인 이메일인데 진행"
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
q "DELETE FROM access_logs WHERE resource_type = 'DATABASE'"

# 정상: START → psql(한 줄 쿼리) → END. 사유의 따옴표는 그대로 저장된다(SQL 인젝션 없음)
reason="장애 조사 #1 '); DROP TABLE users; --"
out="$(bash "$script" --reason "$reason" -- -c "select 'inside-session'" </dev/null 2>"$tmp/err")" && status=0 || status=$?
[ "$status" -eq 0 ] && ok "정상 종료 코드 0" || ng "종료 코드 $status: $(cat "$tmp/err")"
grep -q inside-session <<<"$out" && ok "psql 세션 실행" || ng "psql 출력 없음: $out"
if printf '%s\n%s\n' "$out" "$(cat "$tmp/err")" | grep -q "postgres\(ql\)\?://"; then ng "연결 문자열이 화면에 나왔다"; else ok "연결 문자열을 화면에 내지 않는다"; fi
rows="$(q "SELECT action || '|' || (details->>'operator') || '|' || (details->>'reason') || '|' || (details->>'host' <> '') || '|' || request_id FROM access_logs WHERE resource_type = 'DATABASE' ORDER BY at, action DESC")"
start="$(sed -n 1p <<<"$rows")"
end="$(sed -n 2p <<<"$rows")"
[[ "$start" == "OPERATOR_DB_ACCESS_START|operator@example.com|${reason}|true|opdb:"* ]] && ok "START 기록(운영자 = 토큰 주체, 설정 계정 아님·사유·호스트)" || ng "START: $start"
[[ "$end" == "OPERATOR_DB_ACCESS_END|operator@example.com|${reason}|true|opdb:"* ]] && ok "END 기록" || ng "END: $end"
[ -n "$start" ] && [ "${start##*|}" = "${end##*|}" ] && ok "START·END 세션 ID가 같다" || ng "세션 ID 다름"
[ "$(q "SELECT count(*) FROM users")" -ge 0 ] && ok "users 테이블 그대로"
[ "$(q "SELECT count(DISTINCT user_id) FROM access_logs WHERE resource_type = 'DATABASE'")" = 1 ] && ok "운영자 user_id 하나(이메일 기반 UUID)" || ng "user_id"

# psql이 실패해도(비정상 종료) END가 남고 종료 코드를 돌려준다
q "DELETE FROM access_logs WHERE resource_type = 'DATABASE'"
bash "$script" --reason "실패 경로" -- -c "select * from no_such_table" </dev/null >/dev/null 2>&1 && status=0 || status=$?
[ "$status" -ne 0 ] && ok "실패 종료 코드 $status" || ng "실패인데 0"
end_status="$(q "SELECT details->>'exitStatus' FROM access_logs WHERE action = 'OPERATOR_DB_ACCESS_END'")"
[ "$end_status" = "$status" ] && ok "비정상 종료에도 END(exitStatus=$end_status)" || ng "END exitStatus=$end_status"

# 신호로 끊겨도 trap이 END를 남긴다
q "DELETE FROM access_logs WHERE resource_type = 'DATABASE'"
bash "$script" --reason "신호" -- -c "select pg_sleep(30)" </dev/null >/dev/null 2>&1 &
pid=$!
for _ in $(seq 1 50); do
  [ "$(q "SELECT count(*) FROM access_logs WHERE action = 'OPERATOR_DB_ACCESS_START'")" = 1 ] && break
  sleep 0.2
done
sleep 0.5
kill -TERM "$pid" 2>/dev/null || true
wait "$pid" 2>/dev/null && status=0 || status=$?
end_status="$(q "SELECT details->>'exitStatus' FROM access_logs WHERE action = 'OPERATOR_DB_ACCESS_END'")"
[ -n "$end_status" ] && ok "TERM으로 끊겨도 END(exitStatus=$end_status, 종료 코드 $status)" || ng "TERM 뒤 END 없음"

# psql 세션 중 Ctrl-C(SIGINT)는 쿼리 취소용 — 스크립트는 끝나지 않고, psql이 정상 종료하면 exitStatus 0
q "DELETE FROM access_logs WHERE resource_type = 'DATABASE'"
bash "$script" --reason "SIGINT" -- -c "select pg_sleep(2)" </dev/null >/dev/null 2>&1 &
pid=$!
for _ in $(seq 1 50); do
  [ "$(q "SELECT count(*) FROM access_logs WHERE action = 'OPERATOR_DB_ACCESS_START'")" = 1 ] && break
  sleep 0.2
done
sleep 0.3
kill -INT "$pid" 2>/dev/null || true
wait "$pid" 2>/dev/null && status=0 || status=$?
end_status="$(q "SELECT details->>'exitStatus' FROM access_logs WHERE action = 'OPERATOR_DB_ACCESS_END'")"
[ "$status" -eq 0 ] && [ "$end_status" = 0 ] && ok "세션 중 SIGINT는 종료로 기록하지 않는다(exitStatus=0)" || ng "SIGINT: 종료 코드 $status, exitStatus=$end_status"

# 비밀번호는 환경변수로 넘기지 않는다(psql 하위 셸 \! 이 물려받지 않게). 비밀번호 파일은 끝나면 지운다
q "DELETE FROM access_logs WHERE resource_type = 'DATABASE'"
envout="$(bash "$script" --reason "env" -- -c '\! env' </dev/null 2>/dev/null)" || true
if grep -q '^PGPASSWORD=' <<<"$envout"; then ng "하위 셸에 PGPASSWORD가 있다"; else ok "하위 셸에 PGPASSWORD 없음"; fi
passfile="$(sed -n 's/^PGPASSFILE=//p' <<<"$envout")"
[ -n "$passfile" ] && [ ! -e "$passfile" ] && [ ! -e "$(dirname "$passfile")" ] && ok "비밀번호 파일·폴더를 지웠다" || ng "비밀번호 파일: '$passfile'"

q "DELETE FROM access_logs WHERE resource_type = 'DATABASE'"
exit "$fail"
