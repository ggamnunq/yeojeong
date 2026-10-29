# shellcheck shell=bash
# 운영자의 운영 DB 접속 공통 부분 — scripts/ops/db-connect.sh · scripts/ops/access-review.sh가 source한다(단독 실행 안 함).
# source하기 전에 OPDB_NAME(오류 접두어)과 OPDB_UA(access_logs.ua에 남길 스크립트 이름)를 정한다.
#
# 1. 운영자 = gcloud가 이번에 쓰는 자격 증명의 실제 주체(액세스 토큰을 Google tokeninfo로 확인한 이메일).
#    설정 값(gcloud config의 account)은 믿지 않는다. 같은 자격 증명으로 Secret Manager yeojeong-direct-url을 읽는다.
# 2. 시크릿 값은 셸 변수에만 두고 화면·셸 히스토리·프로세스 인자·환경변수에 남기지 않는다. psql에는 0700 임시 폴더의
#    0600 비밀번호 파일(PGPASSFILE)로 넘기고, 쓸 때마다 새 파일을 만들고 다 쓰면 지운다(psql의 \! 하위 셸이 물려받지 않게).
# 3. TLS verify-full(레포의 Supabase CA). 로컬 테스트 DB(localhost)만 TLS를 생략한다. psql 명령 기록 파일은 남기지 않는다.

: "${OPDB_NAME:?source하기 전에 OPDB_NAME을 정한다}" "${OPDB_UA:?source하기 전에 OPDB_UA를 정한다}"
readonly OPDB_SECRET="yeojeong-direct-url"
readonly OPDB_PROJECT="${GCP_PROJECT_ID:-yeojeong-11fb29}"
readonly OPDB_TOKENINFO_URL="https://oauth2.googleapis.com/tokeninfo"
opdb_repo_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")/../../.." && pwd)"
readonly OPDB_CA="$opdb_repo_dir/infra/envs/prod/certs/supabase-prod-ca-2021.crt"

die() {
  echo "${OPDB_NAME}: $*" >&2
  exit 2
}

opdb_require_tools() {
  command -v gcloud >/dev/null || die "gcloud가 필요합니다"
  command -v psql >/dev/null || die "psql이 필요합니다(brew install libpq)"
  command -v curl >/dev/null || die "curl이 필요합니다"
}

# 운영자 식별: 액세스 토큰 → tokeninfo의 email(토큰의 실제 주체). 토큰은 명령줄 인자에 두지 않고 표준입력으로만 보낸다.
# 정하는 값: operator(이메일), host_name
opdb_identify_operator() {
  local access_token tokeninfo verified
  access_token="$(gcloud auth print-access-token 2>/dev/null)" || die "gcloud 인증이 필요합니다(gcloud auth login)"
  tokeninfo="$(printf 'access_token=%s' "$access_token" |
    curl -fsS --max-time 15 -X POST --data-binary @- "$OPDB_TOKENINFO_URL" 2>/dev/null)" ||
    die "액세스 토큰의 주체를 확인하지 못했습니다(tokeninfo)"
  access_token=""
  _opdb_json_field() {
    printf '%s' "$tokeninfo" | tr -d '\n' |
      sed -n "s/.*\"$1\"[[:space:]]*:[[:space:]]*\"\{0,1\}\([^\",}]*\)\"\{0,1\}.*/\1/p"
  }
  operator="$(_opdb_json_field email)"
  verified="$(_opdb_json_field email_verified)"
  tokeninfo=""
  case "$operator" in
    *@*) ;;
    *) die "액세스 토큰에 이메일이 없습니다(gcloud auth login으로 사용자 계정에 로그인)" ;;
  esac
  [ "$verified" = "true" ] || die "토큰 주체의 이메일이 확인되지 않았습니다($operator)"
  host_name="$(hostname 2>/dev/null || uname -n)"
}

# 연결 정보: 시크릿 원문은 이 함수의 지역 변수에만 둔다(export하지 않는다).
# 정하는 값: db_user db_password db_host db_port db_name sslmode sslrootcert
opdb_load_connection() {
  local db_url re
  db_url="$(gcloud secrets versions access latest --secret="$OPDB_SECRET" --project "$OPDB_PROJECT" 2>/dev/null)" ||
    die "Secret Manager $OPDB_SECRET 을 읽지 못했습니다(권한·프로젝트 확인)"
  # postgresql://user:password@host[:port]/database[?query]
  re='^postgres(ql)?://([^:/@]+):([^@]+)@([^:/?]+)(:([0-9]+))?/([^?]+)(\?.*)?$'
  [[ "$db_url" =~ $re ]] || {
    db_url=""
    die "$OPDB_SECRET 형식을 알 수 없습니다"
  }
  db_url=""
  db_user="$(_opdb_pct_decode "${BASH_REMATCH[2]}")"
  db_password="$(_opdb_pct_decode "${BASH_REMATCH[3]}")"
  db_host="${BASH_REMATCH[4]}"
  db_port="${BASH_REMATCH[6]:-5432}"
  db_name="$(_opdb_pct_decode "${BASH_REMATCH[7]}")"
  # 운영은 Supabase CA로 인증서·호스트 이름을 검증한다. 로컬 테스트 DB(localhost)만 TLS를 생략한다
  case "$db_host" in
    localhost | 127.0.0.1 | ::1) sslmode="disable" sslrootcert="" ;;
    *)
      [ -f "$OPDB_CA" ] || die "Supabase CA 파일이 없습니다: infra/envs/prod/certs/supabase-prod-ca-2021.crt"
      sslmode="verify-full" sslrootcert="$OPDB_CA"
      ;;
  esac
}

_opdb_pct_decode() {
  local s="${1//+/ }"
  printf '%b' "${s//%/\\x}"
}

# 이 접속의 세션 ID(access_logs.request_id = opdb:<세션 ID>로 START·END·점검 기록을 잇는다)
opdb_new_session_id() {
  session_id="$(uuidgen 2>/dev/null | tr '[:upper:]' '[:lower:]' || true)"
  [ -n "$session_id" ] || session_id="$(od -An -N16 -tx1 /dev/urandom | tr -d ' \n')"
}

# 비밀번호는 명령줄 인자(다른 사용자의 ps에 보임)·환경변수(psql의 \! 하위 셸이 물려받음)로 넘기지 않는다.
# 0700 임시 폴더 안 0600 파일(PGPASSFILE). 쓸 때마다 새 파일을 만들고 다 쓰면 지운다. 끝나면 opdb_cleanup
passdir=""
passfile=""
pass_seq=0
opdb_init_passdir() {
  passdir="$(mktemp -d)"
  chmod 700 "$passdir"
}
_opdb_pgpass_escape() {
  local v="${1//\\/\\\\}"
  printf '%s' "${v//:/\\:}"
}
new_passfile() {
  pass_seq=$((pass_seq + 1))
  passfile="$passdir/pgpass.$pass_seq"
  (
    umask 077
    printf '%s:%s:%s:%s:%s\n' "$(_opdb_pgpass_escape "$db_host")" "$db_port" "$(_opdb_pgpass_escape "$db_name")" \
      "$(_opdb_pgpass_escape "$db_user")" "$(_opdb_pgpass_escape "$db_password")" >"$passfile"
  )
}
run_psql() {
  PGHOST="$db_host" PGPORT="$db_port" PGUSER="$db_user" PGDATABASE="$db_name" PGPASSFILE="$passfile" \
    PGSSLMODE="$sslmode" PGSSLROOTCERT="$sslrootcert" PGCONNECT_TIMEOUT=15 \
    PGAPPNAME="yeojeong-operator:${session_id}" PSQL_HISTORY=/dev/null \
    psql "$@"
}
# 한 번 쓰는 비밀번호 파일로 psql을 돌리고 바로 지운다(표준입력·출력은 그대로 넘긴다)
run_psql_once() {
  local status=0
  new_passfile
  run_psql "$@" || status=$?
  rm -f "$passfile"
  return "$status"
}
opdb_cleanup() {
  if [ -n "$passdir" ]; then rm -rf "$passdir"; fi
  db_password=""
}

# 접근 기록 한 행. user_id = 운영자 이메일에서 만든 UUID(users 행 없음), resource_type = DATABASE,
# request_id = 이 접속의 세션 ID(START·END를 잇는다). 값은 psql 변수(:'name')로만 넣는다(SQL 인젝션 방지)
#   log_access <action> <reason> <extra JSON>
log_access() {
  local action="$1" reason="$2" extra="$3"
  run_psql_once -X -q -v ON_ERROR_STOP=1 \
    -v action="$action" -v operator="$operator" -v reason="$reason" -v host="$host_name" \
    -v sid="opdb:${session_id}" -v ua="$OPDB_UA" -v extra="$extra" >/dev/null <<'SQL'
INSERT INTO access_logs (user_id, action, resource_type, request_id, ua, details)
VALUES (
  md5('operator:' || lower(:'operator'))::uuid,
  :'action',
  'DATABASE',
  :'sid',
  :'ua',
  jsonb_build_object('operator', :'operator', 'reason', :'reason', 'host', :'host', 'at', now()) || (:'extra')::jsonb
);
SQL
}
