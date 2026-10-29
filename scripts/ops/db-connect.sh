#!/usr/bin/env bash
# 운영 DB 직접 접속(개인정보취급자 접속 기록, 처리방침 제2조 5번 표 · docs/ops/operator-access.md).
# 회원 개인정보는 관리자 페이지로만 다룬다. DB 직접 접속은 장애 대응 등 불가피할 때만 이 스크립트로 한다.
#
#   scripts/ops/db-connect.sh --reason "결제 동기화 장애 조사(#123)"        # 대화형 psql
#   scripts/ops/db-connect.sh                                             # 사유를 물어본다
#   scripts/ops/db-connect.sh --reason "..." -- -c 'select count(*) from users'   # psql 인자를 그대로 넘긴다
#
# 하는 일
# 1. 사유를 받는다(필수, 한 줄, 200자 이하 — 개인정보를 적지 않는다). 비어 있으면 아무것도 하지 않고 멈춘다.
# 2. 운영자 = gcloud가 이번에 쓰는 자격 증명의 실제 주체(액세스 토큰을 Google tokeninfo로 확인한 이메일).
#    설정 값(gcloud config의 account)은 믿지 않는다. 같은 자격 증명으로 Secret Manager yeojeong-direct-url을 읽는다.
#    값은 셸 변수에만 두고 화면·셸 히스토리·프로세스 인자·환경변수에 남기지 않는다. psql에는 0700 임시 폴더의
#    0600 비밀번호 파일(PGPASSFILE)로 넘기고, 접속하는 동안만 둔 뒤 지운다(psql의 \! 하위 셸이 물려받지 않게).
# 3. access_logs에 OPERATOR_DB_ACCESS_START(운영자 이메일·사유·호스트 이름·시작 시각)를 남긴다. 못 남기면 접속하지 않는다.
# 4. psql 세션(TLS verify-full, Supabase CA). psql 명령 기록 파일은 남기지 않는다(PSQL_HISTORY=/dev/null).
#    psql 안의 Ctrl-C는 쿼리 취소다 — 세션 중에는 스크립트가 SIGINT로 끝나지 않는다(종료 코드 = psql의 종료 코드).
# 5. 끝나면(정상 종료·오류·창 닫힘·SIGTERM) EXIT trap 한 곳에서 OPERATOR_DB_ACCESS_END(접속 시간·종료 코드)를 남긴다.
# 접근 기록은 다른 access_logs와 같이 1년 보관 후 파기 배치(ACCESS_LOGS)가 지운다.
# 기준 기록은 GCP 감사 로그(시크릿 읽기, 400일)다 — 이 기록은 그 보조다(docs/ops/operator-access.md 4절).
set -euo pipefail
set +o history 2>/dev/null || true

readonly SECRET="yeojeong-direct-url"
readonly PROJECT="${GCP_PROJECT_ID:-yeojeong-11fb29}"
readonly MAX_REASON=200
readonly TOKENINFO_URL="https://oauth2.googleapis.com/tokeninfo"
repo_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
readonly CA="$repo_dir/infra/envs/prod/certs/supabase-prod-ca-2021.crt"

die() {
  echo "db-connect: $*" >&2
  exit 2
}

usage() {
  sed -n '2,8p' "${BASH_SOURCE[0]}" | sed 's/^# \{0,1\}//' >&2
  exit 2
}

reason=""
psql_args=()
while [ $# -gt 0 ]; do
  case "$1" in
    --reason)
      [ $# -ge 2 ] || die "--reason 뒤에 사유를 적어 주세요"
      reason="$2"
      shift 2
      ;;
    --reason=*)
      reason="${1#--reason=}"
      shift
      ;;
    --)
      shift
      psql_args=("$@")
      break
      ;;
    -h | --help) usage ;;
    *) die "모르는 인자: $1 (--help)" ;;
  esac
done

if [ -z "$reason" ] && [ -t 0 ]; then
  read -r -p "접속 사유(필수, 개인정보 없이 한 줄): " reason || true
fi
# 앞뒤 공백을 지운다
reason="${reason#"${reason%%[![:space:]]*}"}"
reason="${reason%"${reason##*[![:space:]]}"}"
[ -n "$reason" ] || die "사유가 없어 접속하지 않습니다"
case "$reason" in
  *$'\n'* | *$'\r'*) die "사유는 한 줄로 적어 주세요" ;;
esac
[ "${#reason}" -le "$MAX_REASON" ] || die "사유는 ${MAX_REASON}자 이하로 적어 주세요"

command -v gcloud >/dev/null || die "gcloud가 필요합니다"
command -v psql >/dev/null || die "psql이 필요합니다(brew install libpq)"
command -v curl >/dev/null || die "curl이 필요합니다"

# 운영자 식별: 액세스 토큰 → tokeninfo의 email(토큰의 실제 주체). 토큰은 명령줄 인자에 두지 않고 표준입력으로만 보낸다
access_token="$(gcloud auth print-access-token 2>/dev/null)" || die "gcloud 인증이 필요합니다(gcloud auth login)"
tokeninfo="$(printf 'access_token=%s' "$access_token" |
  curl -fsS --max-time 15 -X POST --data-binary @- "$TOKENINFO_URL" 2>/dev/null)" ||
  die "액세스 토큰의 주체를 확인하지 못했습니다(tokeninfo)"
access_token=""
json_field() {
  printf '%s' "$tokeninfo" | tr -d '\n' |
    sed -n "s/.*\"$1\"[[:space:]]*:[[:space:]]*\"\{0,1\}\([^\",}]*\)\"\{0,1\}.*/\1/p"
}
operator="$(json_field email)"
verified="$(json_field email_verified)"
tokeninfo=""
case "$operator" in
  *@*) ;;
  *) die "액세스 토큰에 이메일이 없습니다(gcloud auth login으로 사용자 계정에 로그인)" ;;
esac
[ "$verified" = "true" ] || die "토큰 주체의 이메일이 확인되지 않았습니다($operator)"
host_name="$(hostname 2>/dev/null || uname -n)"

# 시크릿 원문은 이 변수에만 둔다(export하지 않는다)
db_url="$(gcloud secrets versions access latest --secret="$SECRET" --project "$PROJECT" 2>/dev/null)" ||
  die "Secret Manager $SECRET 을 읽지 못했습니다(권한·프로젝트 확인)"

# postgresql://user:password@host[:port]/database[?query]
re='^postgres(ql)?://([^:/@]+):([^@]+)@([^:/?]+)(:([0-9]+))?/([^?]+)(\?.*)?$'
[[ "$db_url" =~ $re ]] || {
  db_url=""
  die "$SECRET 형식을 알 수 없습니다"
}
pct_decode() {
  local s="${1//+/ }"
  printf '%b' "${s//%/\\x}"
}
db_user="$(pct_decode "${BASH_REMATCH[2]}")"
db_password="$(pct_decode "${BASH_REMATCH[3]}")"
db_host="${BASH_REMATCH[4]}"
db_port="${BASH_REMATCH[6]:-5432}"
db_name="$(pct_decode "${BASH_REMATCH[7]}")"
db_url=""

# 운영은 Supabase CA로 인증서·호스트 이름을 검증한다. 로컬 테스트 DB(localhost)만 TLS를 생략한다
case "$db_host" in
  localhost | 127.0.0.1 | ::1) sslmode="disable" sslrootcert="" ;;
  *)
    [ -f "$CA" ] || die "Supabase CA 파일이 없습니다: infra/envs/prod/certs/supabase-prod-ca-2021.crt"
    sslmode="verify-full" sslrootcert="$CA"
    ;;
esac

session_id="$(uuidgen 2>/dev/null | tr '[:upper:]' '[:lower:]' || true)"
[ -n "$session_id" ] || session_id="$(od -An -N16 -tx1 /dev/urandom | tr -d ' \n')"

started=0
ended=0
started_at="$(date +%s)"
deleter=""
passdir=""
passfile=""
pass_seq=0

# 종료 기록은 EXIT trap 한 곳에서만 남긴다(신호 trap은 종료 코드만 정하고 exit로 넘긴다)
# shellcheck disable=SC2329 # trap이 부른다
finish() {
  local status=$?
  [ "$ended" -eq 0 ] || return 0
  ended=1
  trap - EXIT INT TERM HUP
  if [ -n "$deleter" ]; then kill "$deleter" 2>/dev/null || true; fi
  if [ "$started" -eq 1 ]; then
    local duration=$(($(date +%s) - started_at))
    if ! log_access OPERATOR_DB_ACCESS_END "{\"durationSec\": ${duration}, \"exitStatus\": ${status}}"; then
      echo "db-connect: 종료 기록(OPERATOR_DB_ACCESS_END)을 남기지 못했습니다. docs/ops/operator-access.md의 수동 기록 절차를 따르세요(세션 ${session_id})" >&2
    fi
  fi
  if [ -n "$passdir" ]; then rm -rf "$passdir"; fi
  db_password=""
  exit "$status"
}
trap finish EXIT
trap 'exit 130' INT
trap 'exit 143' TERM
trap 'exit 129' HUP

# 비밀번호는 명령줄 인자(다른 사용자의 ps에 보임)·환경변수(psql의 \! 하위 셸이 물려받음)로 넘기지 않는다.
# 0700 임시 폴더 안 0600 파일(PGPASSFILE). 쓸 때마다 새 파일을 만들고 다 쓰면 지운다
passdir="$(mktemp -d)"
chmod 700 "$passdir"
pgpass_escape() {
  local v="${1//\\/\\\\}"
  printf '%s' "${v//:/\\:}"
}
new_passfile() {
  pass_seq=$((pass_seq + 1))
  passfile="$passdir/pgpass.$pass_seq"
  (
    umask 077
    printf '%s:%s:%s:%s:%s\n' "$(pgpass_escape "$db_host")" "$db_port" "$(pgpass_escape "$db_name")" \
      "$(pgpass_escape "$db_user")" "$(pgpass_escape "$db_password")" >"$passfile"
  )
}
run_psql() {
  PGHOST="$db_host" PGPORT="$db_port" PGUSER="$db_user" PGDATABASE="$db_name" PGPASSFILE="$passfile" \
    PGSSLMODE="$sslmode" PGSSLROOTCERT="$sslrootcert" PGCONNECT_TIMEOUT=15 \
    PGAPPNAME="yeojeong-operator:${session_id}" PSQL_HISTORY=/dev/null \
    psql "$@"
}

# 접근 기록 한 행. user_id = 운영자 이메일에서 만든 UUID(users 행 없음), resource_type = DATABASE,
# request_id = 이 접속의 세션 ID(START·END를 잇는다). 값은 psql 변수(:'name')로만 넣는다(SQL 인젝션 방지)
log_access() {
  local action="$1" extra="$2" status=0
  new_passfile
  run_psql -X -q -v ON_ERROR_STOP=1 \
    -v action="$action" -v operator="$operator" -v reason="$reason" -v host="$host_name" \
    -v sid="opdb:${session_id}" -v extra="$extra" >/dev/null <<'SQL' || status=$?
INSERT INTO access_logs (user_id, action, resource_type, request_id, ua, details)
VALUES (
  md5('operator:' || lower(:'operator'))::uuid,
  :'action',
  'DATABASE',
  :'sid',
  'scripts/ops/db-connect.sh',
  jsonb_build_object('operator', :'operator', 'reason', :'reason', 'host', :'host', 'at', now()) || (:'extra')::jsonb
);
SQL
  rm -f "$passfile"
  return "$status"
}

log_access OPERATOR_DB_ACCESS_START '{}' || die "시작 기록(OPERATOR_DB_ACCESS_START)을 남기지 못해 접속하지 않습니다"
started=1
started_at="$(date +%s)"

echo "운영 DB 접속: ${operator} · 세션 ${session_id} · 사유 \"${reason}\" (끝내려면 \\q)" >&2
# 세션용 비밀번호 파일은 접속(최대 PGCONNECT_TIMEOUT 15초)에만 쓰고 20초 뒤 지운다. 그 뒤 \c 재접속은 비밀번호를 묻는다
new_passfile
session_passfile="$passfile"
(
  sleep 20
  rm -f "$session_passfile"
) </dev/null >/dev/null 2>&1 &
deleter=$!
# psql 안의 Ctrl-C는 쿼리 취소다. 그동안 스크립트는 SIGINT를 무시한다(trap 명령은 exec된 psql에 물려지지 않는다)
trap ':' INT
set +e
if [ "${#psql_args[@]}" -gt 0 ]; then
  run_psql -X -v ON_ERROR_STOP=1 "${psql_args[@]}"
else
  run_psql
fi
status=$?
set -e
trap 'exit 130' INT
rm -f "$session_passfile"
exit "$status"
