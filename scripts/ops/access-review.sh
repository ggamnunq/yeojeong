#!/usr/bin/env bash
# 월 1회 접속기록 점검(「개인정보의 안전성 확보조치 기준」 접속기록 점검 · docs/ops/operator-access.md 4절) — 요약을 보고 결과를 남긴다.
#
#   scripts/ops/access-review.sh                                     # 지난 점검 이후 ~ 지금. 요약을 보여 주고 결과·메모를 묻는다
#   scripts/ops/access-review.sh --since 2026-10-01                  # 점검 기간 시작(KST 날짜)을 직접 정한다
#   scripts/ops/access-review.sh --result ok --note "GCP 감사 로그 대조 완료"      # 묻지 않고 기록(이상 없음)
#   scripts/ops/access-review.sh --result issue --note "#123 낯선 IP 확인 중"       # 이상 있음(메모 필수)
#
# 하는 일
# 1. 결과·메모·기간 인자를 먼저 검사한다(잘못되면 gcloud를 부르기 전에 멈춘다). 메모는 한 줄, 500자 이하, 개인정보 없이.
# 2. db-connect.sh와 같은 방식으로 접속한다(scripts/ops/lib/operator-db.sh): 운영자 = gcloud 액세스 토큰의 실제 주체(tokeninfo 이메일),
#    연결 정보는 Secret Manager yeojeong-direct-url — 값은 화면·인자·환경변수에 남기지 않는다.
#    이 점검도 DB 직접 접속이므로 OPERATOR_DB_ACCESS_START(사유 "월간 접속기록 점검")·END를 남긴다(GCP 감사 로그의 시크릿 읽기와 대조).
# 3. 점검 기간 = 지난 점검 기록(OPERATOR_ACCESS_REVIEW)의 periodEnd 이후 ~ 이번 접속 시작. 지난 기록이 없으면 지난달 1일(KST)부터.
# 4. 요약(KST): 관리자 접근 기록(행위·client_ip별 건수, 처음 보는 IP 표시), 관리자 로그인 실패(client_ip·사유별),
#    DB 직접 접속(START·END 짝, 짝 없는 START/END), 최근 점검 기록, GCP 감사 로그(callerIp) 대조 명령.
# 5. 결과(이상 없음 / 이상 있음)와 메모를 받아 access_logs에 OPERATOR_ACCESS_REVIEW 한 행을 남긴다 —
#    details = { operator, host, periodStart, periodEnd, result: OK|ISSUE, note, summary(건수), at }. 값은 psql 변수로만 넣는다.
#    결과를 받지 못하면(대화형이 아니고 --result도 없음) 기록하지 않고 종료 코드 3.
set -euo pipefail
set +o history 2>/dev/null || true

readonly MAX_NOTE=500
readonly ACCESS_REASON="월간 접속기록 점검"
# shellcheck disable=SC2034 # lib/operator-db.sh가 쓴다
OPDB_NAME="access-review"
# shellcheck disable=SC2034
OPDB_UA="scripts/ops/access-review.sh"
# shellcheck source-path=SCRIPTDIR source=lib/operator-db.sh
. "$(dirname "${BASH_SOURCE[0]}")/lib/operator-db.sh"

usage() {
  sed -n '2,7p' "${BASH_SOURCE[0]}" | sed 's/^# \{0,1\}//' >&2
  exit 2
}

result=""
note=""
note_given=0
since=""
while [ $# -gt 0 ]; do
  case "$1" in
    --result | --note | --since)
      [ $# -ge 2 ] || die "$1 뒤에 값을 적어 주세요"
      case "$1" in
        --result) result="$2" ;;
        --note) note="$2" note_given=1 ;;
        --since) since="$2" ;;
      esac
      shift 2
      ;;
    -h | --help) usage ;;
    *) die "모르는 인자: $1 (--help)" ;;
  esac
done

trim() {
  local v="$1"
  v="${v#"${v%%[![:space:]]*}"}"
  printf '%s' "${v%"${v##*[![:space:]]}"}"
}

normalize_result() {
  case "$1" in
    ok | OK | 1 | "이상 없음" | 이상없음) echo "OK" ;;
    issue | ISSUE | 2 | "이상 있음" | 이상있음) echo "ISSUE" ;;
    *) return 1 ;;
  esac
}

check_note() {
  case "$1" in
    *$'\n'* | *$'\r'*) die "메모는 한 줄로 적어 주세요" ;;
  esac
  [ "${#1}" -le "$MAX_NOTE" ] || die "메모는 ${MAX_NOTE}자 이하로 적어 주세요"
}

if [ -n "$result" ]; then
  result="$(normalize_result "$result")" || die "--result는 ok(이상 없음) 또는 issue(이상 있음)입니다"
fi
note="$(trim "$note")"
check_note "$note"
[ "$result" != "ISSUE" ] || [ -n "$note" ] || die "이상 있음이면 메모(무엇을 확인·조치하는지)를 적어 주세요"
if [ -n "$since" ]; then
  [[ "$since" =~ ^[0-9]{4}-[0-9]{2}-[0-9]{2}$ ]] || die "--since는 YYYY-MM-DD(KST 날짜)입니다"
fi

opdb_require_tools
opdb_identify_operator
opdb_load_connection
opdb_new_session_id

started=0
ended=0
started_at="$(date +%s)"

# 종료 기록은 EXIT trap 한 곳에서만 남긴다(db-connect.sh와 같다)
# shellcheck disable=SC2329 # trap이 부른다
finish() {
  local status=$?
  [ "$ended" -eq 0 ] || return 0
  ended=1
  trap - EXIT INT TERM HUP
  if [ "$started" -eq 1 ]; then
    local duration=$(($(date +%s) - started_at))
    if ! log_access OPERATOR_DB_ACCESS_END "$ACCESS_REASON" "{\"durationSec\": ${duration}, \"exitStatus\": ${status}}"; then
      echo "access-review: 종료 기록(OPERATOR_DB_ACCESS_END)을 남기지 못했습니다. docs/ops/operator-access.md의 수동 기록 절차를 따르세요(세션 ${session_id})" >&2
    fi
  fi
  opdb_cleanup
  exit "$status"
}
trap finish EXIT
trap 'exit 130' INT
trap 'exit 143' TERM
trap 'exit 129' HUP

opdb_init_passdir

log_access OPERATOR_DB_ACCESS_START "$ACCESS_REASON" '{}' || die "시작 기록(OPERATOR_DB_ACCESS_START)을 남기지 못해 점검하지 않습니다"
started=1
started_at="$(date +%s)"
sid="opdb:${session_id}"

# 점검 기간: 시작 = --since(KST 0시) → 지난 점검의 periodEnd → 지난달 1일(KST). 끝 = 이번 접속의 START 시각(이 점검 자신은 빼고 다음 점검에 들어간다)
period="$(run_psql_once -X -q -At -F '|' -v ON_ERROR_STOP=1 -v since="$since" -v sid="$sid" <<'SQL'
WITH bounds AS (
  SELECT
    COALESCE(
      (NULLIF(:'since', '')::date::timestamp AT TIME ZONE 'Asia/Seoul'),
      (SELECT (details->>'periodEnd')::timestamptz FROM access_logs
        WHERE action = 'OPERATOR_ACCESS_REVIEW' ORDER BY at DESC LIMIT 1),
      ((date_trunc('month', now() AT TIME ZONE 'Asia/Seoul') - interval '1 month') AT TIME ZONE 'Asia/Seoul')
    ) AS period_start,
    (SELECT at FROM access_logs WHERE request_id = :'sid' AND action = 'OPERATOR_DB_ACCESS_START') AS period_end
)
SELECT to_char(period_start AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"'),
       to_char(period_end AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"'),
       to_char(period_start AT TIME ZONE 'Asia/Seoul', 'YYYY-MM-DD HH24:MI'),
       to_char(period_end AT TIME ZONE 'Asia/Seoul', 'YYYY-MM-DD HH24:MI')
FROM bounds;
SQL
)" || die "점검 기간을 정하지 못했습니다"
IFS='|' read -r period_start period_end period_start_kst period_end_kst <<<"$period"
[ -n "$period_start" ] && [ -n "$period_end" ] || die "점검 기간을 정하지 못했습니다"
[[ "$period_start" < "$period_end" ]] || die "점검 기간 시작(${period_start_kst})이 끝(${period_end_kst})보다 늦습니다"

echo "월간 접속기록 점검 · 점검자 ${operator} · 세션 ${session_id}"
echo "점검 기간(KST): ${period_start_kst} ~ ${period_end_kst}"

# 요약 표(KST). 이번 점검 세션의 기록은 빼고 본다
run_psql_once -X -q -v ON_ERROR_STOP=1 -P pager=off -P footer=off -v pstart="$period_start" -v pend="$period_end" -v sid="$sid" <<'SQL'
SET TIME ZONE 'Asia/Seoul';
\echo
\echo '■ 관리자 페이지 접근 기록(ADMIN_*) — 행위·client_ip별. 처음 보는 IP = 기간 전에는 없던 IP'
SELECT a.action AS "행위", a.client_ip AS "client_ip", count(*) AS "건수",
       to_char(min(a.at), 'MM-DD HH24:MI') AS "처음", to_char(max(a.at), 'MM-DD HH24:MI') AS "마지막",
       CASE WHEN a.client_ip IS NOT NULL AND NOT EXISTS (
         SELECT 1 FROM access_logs p WHERE p.client_ip = a.client_ip AND p.at < :'pstart'::timestamptz
       ) THEN '처음 보는 IP' ELSE '' END AS "확인"
FROM access_logs a
WHERE a.action LIKE 'ADMIN\_%' AND a.at >= :'pstart'::timestamptz AND a.at < :'pend'::timestamptz
GROUP BY a.action, a.client_ip ORDER BY a.action, count(*) DESC;
\echo '■ 관리자 로그인 실패(ADMIN_LOGIN_FAILED) — client_ip·사유별(급증·낯선 IP 확인)'
SELECT client_ip AS "client_ip", details->>'reason' AS "사유", count(*) AS "건수",
       to_char(min(at), 'MM-DD HH24:MI') AS "처음", to_char(max(at), 'MM-DD HH24:MI') AS "마지막"
FROM access_logs
WHERE action = 'ADMIN_LOGIN_FAILED' AND at >= :'pstart'::timestamptz AND at < :'pend'::timestamptz
GROUP BY client_ip, details->>'reason' ORDER BY count(*) DESC;
\echo '■ DB 직접 접속(OPERATOR_DB_ACCESS_START·END) — 짝이 맞는지, 사유·호스트·시각이 업무와 맞는지'
SELECT s.request_id AS "세션", s.details->>'operator' AS "운영자", s.details->>'reason' AS "사유", s.details->>'host' AS "호스트",
       to_char(s.at, 'MM-DD HH24:MI') AS "시작", to_char(e.at, 'MM-DD HH24:MI') AS "종료",
       e.details->>'exitStatus' AS "종료 코드", CASE WHEN e.id IS NULL THEN 'END 없음' ELSE '' END AS "확인"
FROM access_logs s
LEFT JOIN access_logs e ON e.request_id = s.request_id AND e.action = 'OPERATOR_DB_ACCESS_END'
WHERE s.action = 'OPERATOR_DB_ACCESS_START' AND s.request_id <> :'sid'
  AND s.at >= :'pstart'::timestamptz AND s.at < :'pend'::timestamptz
UNION ALL
SELECT e.request_id, e.details->>'operator', e.details->>'reason', e.details->>'host',
       NULL, to_char(e.at, 'MM-DD HH24:MI'), e.details->>'exitStatus', 'START 없음'
FROM access_logs e
WHERE e.action = 'OPERATOR_DB_ACCESS_END' AND e.request_id <> :'sid'
  AND e.at >= :'pstart'::timestamptz AND e.at < :'pend'::timestamptz
  AND NOT EXISTS (SELECT 1 FROM access_logs s WHERE s.request_id = e.request_id AND s.action = 'OPERATOR_DB_ACCESS_START')
ORDER BY 5 NULLS LAST, 6;
\echo '■ 최근 점검 기록(OPERATOR_ACCESS_REVIEW)'
SELECT to_char(at, 'YYYY-MM-DD HH24:MI') AS "점검 시각", details->>'operator' AS "점검자",
       details->>'result' AS "결과", details->>'note' AS "메모"
FROM access_logs WHERE action = 'OPERATOR_ACCESS_REVIEW' ORDER BY at DESC LIMIT 3;
SQL

# 기록에 남길 건수(숫자만)
counts="$(run_psql_once -X -q -At -F '|' -v ON_ERROR_STOP=1 -v pstart="$period_start" -v pend="$period_end" -v sid="$sid" <<'SQL'
WITH p AS (SELECT :'pstart'::timestamptz AS s, :'pend'::timestamptz AS e),
inrange AS (SELECT a.* FROM access_logs a, p WHERE a.at >= p.s AND a.at < p.e AND (a.request_id IS DISTINCT FROM :'sid'))
SELECT
  (SELECT count(*) FROM inrange WHERE action LIKE 'ADMIN\_%'),
  (SELECT count(*) FROM inrange WHERE action = 'ADMIN_LOGIN_FAILED'),
  (SELECT count(DISTINCT client_ip) FROM inrange WHERE action LIKE 'ADMIN\_%' AND client_ip IS NOT NULL),
  (SELECT count(*) FROM inrange WHERE action = 'OPERATOR_DB_ACCESS_START'),
  (SELECT count(*) FROM inrange s WHERE s.action = 'OPERATOR_DB_ACCESS_START'
     AND NOT EXISTS (SELECT 1 FROM access_logs e WHERE e.request_id = s.request_id AND e.action = 'OPERATOR_DB_ACCESS_END')),
  (SELECT count(*) FROM inrange e WHERE e.action = 'OPERATOR_DB_ACCESS_END'
     AND NOT EXISTS (SELECT 1 FROM access_logs s WHERE s.request_id = e.request_id AND s.action = 'OPERATOR_DB_ACCESS_START'));
SQL
)" || die "건수를 세지 못했습니다"
IFS='|' read -r n_admin n_failed n_ips n_db n_no_end n_no_start <<<"$counts"
for n in "$n_admin" "$n_failed" "$n_ips" "$n_db" "$n_no_end" "$n_no_start"; do
  [[ "$n" =~ ^[0-9]+$ ]] || die "건수 형식이 이상합니다"
done
summary="{\"adminEvents\": ${n_admin}, \"adminLoginFailed\": ${n_failed}, \"adminClientIps\": ${n_ips}, \"dbSessions\": ${n_db}, \"dbStartWithoutEnd\": ${n_no_end}, \"dbEndWithoutStart\": ${n_no_start}}"

echo
echo "요약: 관리자 접근 ${n_admin}건(IP ${n_ips}개) · 로그인 실패 ${n_failed}건 · DB 직접 접속 ${n_db}회 · END 없음 ${n_no_end} · START 없음 ${n_no_start}"
echo
echo "■ GCP 감사 로그(기준 기록) 대조 — 사람 계정의 시크릿 읽기마다 위 DB 직접 접속(START)이 있어야 하고, callerIp가 아는 곳이어야 합니다:"
cat <<EOF
  gcloud logging read 'protoPayload.methodName="google.cloud.secretmanager.v1.SecretManagerService.AccessSecretVersion"
    AND (protoPayload.resourceName:"secrets/yeojeong-direct-url" OR protoPayload.resourceName:"secrets/yeojeong-database-url")
    AND timestamp>="${period_start}" AND timestamp<"${period_end}"' --project ${OPDB_PROJECT} \\
    --format='table(timestamp, protoPayload.resourceName, protoPayload.authenticationInfo.principalEmail, protoPayload.requestMetadata.callerIp)'
EOF
echo

if [ -z "$result" ]; then
  if [ ! -t 0 ]; then
    echo "access-review: 결과를 기록하지 않았습니다(대화형으로 다시 실행하거나 --result ok|issue --note \"...\")" >&2
    exit 3
  fi
  answer=""
  while [ -z "$result" ]; do
    read -r -p "점검 결과 — 1) 이상 없음  2) 이상 있음: " answer || die "입력이 끊겨 기록하지 않았습니다"
    result="$(normalize_result "$(trim "$answer")")" || result=""
  done
  if [ "$note_given" -eq 0 ]; then
    read -r -p "메모(한 줄, ${MAX_NOTE}자 이하, 개인정보 없이$([ "$result" = "ISSUE" ] && echo ' — 필수')): " note || true
    note="$(trim "$note")"
    check_note "$note"
  fi
  [ "$result" != "ISSUE" ] || [ -n "$note" ] || die "이상 있음이면 메모가 필요합니다 — 기록하지 않았습니다"
fi

# 점검 기록 한 행. 메모 등 값은 psql 변수(:'name')로만 넣는다(SQL 인젝션 방지)
run_psql_once -X -q -v ON_ERROR_STOP=1 \
  -v operator="$operator" -v host="$host_name" -v sid="$sid" -v ua="$OPDB_UA" \
  -v pstart="$period_start" -v pend="$period_end" -v result="$result" -v note="$note" -v summary="$summary" >/dev/null <<'SQL' ||
INSERT INTO access_logs (user_id, action, resource_type, request_id, ua, details)
VALUES (
  md5('operator:' || lower(:'operator'))::uuid,
  'OPERATOR_ACCESS_REVIEW',
  'DATABASE',
  :'sid',
  :'ua',
  jsonb_build_object(
    'operator', :'operator', 'host', :'host',
    'periodStart', :'pstart', 'periodEnd', :'pend',
    'result', :'result', 'note', :'note',
    'summary', (:'summary')::jsonb, 'at', now()
  )
);
SQL
  die "점검 기록(OPERATOR_ACCESS_REVIEW)을 남기지 못했습니다"

echo "점검 기록을 남겼습니다: $([ "$result" = "OK" ] && echo "이상 없음" || echo "이상 있음") · 기간 ${period_start_kst} ~ ${period_end_kst} · 세션 ${session_id}"
