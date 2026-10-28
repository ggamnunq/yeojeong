#!/usr/bin/env bash
# 운영 DB(Supabase 세션 풀러)에 Prisma CLI를 실행한다. 배포 워크플로와 로컬 수동 실행이 같이 쓴다.
#   예) apps/api/scripts/prisma-prod.sh migrate status
#
# - 연결 정보는 DIRECT_URL_RAW 환경변수로 받는다. 없으면 gcloud로 Secret Manager(yeojeong-direct-url)에서 읽는다.
#   값은 출력하지 않는다.
# - Prisma CLI는 libpq식 sslmode=verify-full·sslrootcert를 무시한다(틀린 CA로도 붙는다). 그래서 시크릿의 쿼리 문자열을
#   버리고 sslcert(Supabase CA)+sslaccept=strict를 붙여 인증서와 호스트 이름을 검증한다.
# - macOS의 TLS 스택은 Supabase 풀러 인증서(EKU 없음, 유효기간 5년)를 맞는 CA로도 거부한다.
#   macOS에서는 Linux 컨테이너(OpenSSL) 안에서 같은 스크립트를 다시 실행한다.
set -euo pipefail

# 운영에서는 되돌릴 수 없는 명령(migrate reset, migrate dev, db push 등)을 막는다
case "${1:-} ${2:-}" in
  "migrate deploy" | "migrate status" | "migrate resolve" | "migrate diff") ;;
  *)
    echo "usage: $0 migrate {deploy|status|resolve|diff} [options]" >&2
    exit 2
    ;;
esac

api_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
repo_dir="$(cd "$api_dir/../.." && pwd)"
ca="$repo_dir/infra/envs/prod/certs/supabase-prod-ca-2021.crt"

if [ -z "${DIRECT_URL_RAW:-}" ]; then
  DIRECT_URL_RAW="$(gcloud secrets versions access latest --secret=yeojeong-direct-url \
    --project "${GCP_PROJECT_ID:-yeojeong-11fb29}")"
fi
export DIRECT_URL_RAW

if [ "$(uname -s)" = "Darwin" ]; then
  echo "macOS라 Linux 컨테이너에서 실행합니다 (node:26-bookworm-slim)" >&2
  exec docker run --rm -e DIRECT_URL_RAW \
    -v "$repo_dir":/src:ro -v yeojeong-pnpm-store:/root/.local/share/pnpm/store \
    node:26-bookworm-slim bash -euo pipefail -c '
      apt-get update -qq >/dev/null
      apt-get install -y -qq --no-install-recommends openssl ca-certificates >/dev/null 2>&1
      mkdir /repo
      tar -C /src --exclude=node_modules --exclude=.git --exclude=.claude --exclude=.terraform \
        --exclude=dist --exclude=coverage --exclude=".env" --exclude="*.tfvars" --exclude="*.tfstate*" \
        -cf - . | tar -C /repo -xf -
      npm install -g --silent pnpm@11.21.0
      cd /repo
      pnpm install --silent --frozen-lockfile --filter @yeojeong/api... >/dev/null
      exec bash apps/api/scripts/prisma-prod.sh "$@"
    ' -- "$@"
fi

base="${DIRECT_URL_RAW%%\?*}"
if [ -n "${GITHUB_ACTIONS:-}" ]; then
  # 시크릿 원문은 get-secretmanager-secrets가 가리지만, 잘라 낸 부분 문자열은 따로 가려야 한다
  password="${base#*://}"
  password="${password#*:}"
  password="${password%%@*}"
  echo "::add-mask::$password"
  echo "::add-mask::$base"
fi
DIRECT_URL="${base}?sslmode=require&sslcert=${ca}&sslaccept=strict&connect_timeout=30"
export DIRECT_URL
unset DIRECT_URL_RAW base password

cd "$api_dir"
exec pnpm exec prisma "$@"
