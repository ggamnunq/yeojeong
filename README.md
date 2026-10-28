# 여정

여행 공동 지갑 웹앱.

보안 원칙은 [docs/security.md](docs/security.md), 취약점 신고는 [SECURITY.md](SECURITY.md)를 참고하세요.

## 구조

```
apps/web            화면 (React + Vite + TypeScript + Tailwind CSS)
apps/web/worker     운영에서 /api 요청을 Cloud Run으로 넘기는 Cloudflare Worker
apps/api            서버 (NestJS + Prisma)
packages/shared     화면과 서버가 같이 쓰는 타입
docker-compose.yml  로컬 PostgreSQL
```

## 필요한 도구

- Node.js 24 이상 (`.nvmrc`는 26)
- pnpm 11 (`npm install -g pnpm@11`)
- Docker

## 처음 실행

```bash
pnpm install
cp apps/api/.env.example apps/api/.env
pnpm db:up   # PostgreSQL 실행
pnpm dev     # 화면 http://localhost:5173 · 서버 http://localhost:3000/api
```

개발 중에는 화면에서 `/api`로 보내는 요청을 Vite 개발 서버가 API 서버로 넘겨 줍니다.

## 자주 쓰는 명령

| 명령                                     | 설명                              |
| ---------------------------------------- | --------------------------------- |
| `pnpm build`                             | 전체 빌드                         |
| `pnpm lint`                              | 린트 (oxlint)                     |
| `pnpm test`                              | 화면·API 단위 테스트 + API e2e    |
| `pnpm db:down`                           | DB 중지 (데이터는 볼륨에 남음)    |
| `pnpm --filter @yeojeong/api db:migrate` | Prisma 스키마 변경을 DB에 반영    |
| `pnpm --filter @yeojeong/web catalog`    | 디자인 시스템 카탈로그(개발용)    |
| `pnpm --filter @yeojeong/web ds:tokens`  | 디자인 토큰 → `tokens.css` 재생성 |

## 배포

API 이미지는 레포 루트에서 빌드합니다.

```bash
docker build -f apps/api/Dockerfile -t yeojeong-api .
```

실행할 때 `DATABASE_URL`이 필요합니다. 운영에서는 화면과 API가 같은 origin(`https://jinyeojeong.com`)이라 `WEB_ORIGIN`은 비워 둡니다.

## 인프라

화면은 Cloudflare Workers, API는 Google Cloud Run(서울), DB는 Supabase(서울)에 있고 Terraform으로 관리합니다.

```
https://jinyeojeong.com ─ Cloudflare Worker yeojeong-web
                           ├─ /*      정적 화면 (apps/web/dist)
                           └─ /api/*  Cloud Run yeojeong-api로 프록시 (origin lock 헤더 추가)

infra/bootstrap   GCP 프로젝트, 결제 연결, Terraform state 버킷 (처음 한 번, state는 로컬)
infra/envs/prod   Cloud Run, Artifact Registry, Secret Manager, Supabase 설정,
                  GitHub Actions용 Workload Identity, 예산 알림,
                  Cloudflare(jinyeojeong.com zone 설정·DNS·리다이렉트·rate limit, Worker 커스텀 도메인) (state는 GCS)
```

같은 Cloudflare 계정에 다른 프로젝트가 있으므로 Terraform과 토큰은 `jinyeojeong.com` zone과 `yeojeong-web` Worker만 다룹니다.

### 준비

- `gcloud auth login`으로 로그인합니다. Terraform은 ADC 대신 gcloud 토큰을 씁니다.
- Supabase 개인 토큰은 대시보드 Account → Access Tokens에서 만들고 macOS 키체인에 저장합니다.
  ```bash
  security add-generic-password -a "$USER" -s yeojeong-supabase-pat -w '<토큰>'
  ```
- Cloudflare 토큰 `yeojeong-terraform`(2027-04-28 만료)은 키체인 `yeojeong-cloudflare-terraform`에 있습니다. 새로 만들 때 권한은 아래만 줍니다.
  - zone `jinyeojeong.com`: Zone Read, Zone Settings Write, DNS Write, SSL and Certificates Write, Dynamic URL Redirects Write, Zone WAF Write, Workers Routes Write
  - 계정: Workers Scripts Write
- 각 폴더의 `terraform.tfvars.example`을 `terraform.tfvars`로 복사해 값을 채웁니다. tfvars와 state는 커밋하지 않습니다.

### 적용

```bash
export GOOGLE_OAUTH_ACCESS_TOKEN=$(gcloud auth print-access-token)
export SUPABASE_ACCESS_TOKEN=$(security find-generic-password -a "$USER" -s yeojeong-supabase-pat -w)
export CLOUDFLARE_API_TOKEN=$(security find-generic-password -a "$USER" -s yeojeong-cloudflare-terraform -w)

cd infra/bootstrap && terraform init && terraform apply     # 처음 한 번
cd ../envs/prod
terraform init -backend-config="bucket=<프로젝트 ID>-tfstate"
terraform apply
```

Supabase 프로젝트는 대시보드에서 만든 것을 `terraform import supabase_project.prod <project ref>`로 가져왔습니다. DB 비밀번호는 Terraform이 만든 값으로 바뀌어 state와 Secret Manager에만 있습니다.

- 런타임 연결(`yeojeong-database-url`): Supavisor transaction 모드(6543)이고, Supabase CA로 인증서를 검증(`sslmode=verify-full`)합니다.
- 마이그레이션용 연결(`yeojeong-direct-url`): session 모드(5432)입니다.
- Supabase Data API는 꺼 두었고, SSL 연결만 받으며, Supabase Auth 가입도 막혀 있습니다.

### 배포

#### 화면 (Cloudflare Worker)

`main`에 화면 관련 변경이 push되면 `.github/workflows/deploy-web.yml`이 화면을 빌드하고 `wrangler deploy`로 Worker 스크립트와 정적 자산을 올립니다.

- Cloudflare 배포 토큰 `yeojeong-web-deploy`(계정 Workers Scripts Write만, 2027-10-28 만료)는 GitHub `production` 환경 secret입니다. 이 환경은 `main` 브랜치에서만 쓸 수 있습니다.
- workers.dev와 preview URL은 꺼 두었고, 진입 도메인 연결은 Terraform(`cloudflare_workers_custom_domain`)이 맡습니다.
- Worker secret `API_ORIGIN`(Cloud Run 주소)과 `ORIGIN_SECRET`은 처음 한 번, 또는 값을 바꿀 때만 넣습니다.
  ```bash
  cd apps/web
  export CLOUDFLARE_ACCOUNT_ID=<계정 ID> CLOUDFLARE_API_TOKEN=$(security find-generic-password -a "$USER" -s yeojeong-cloudflare-terraform -w)
  terraform -chdir=../../infra/envs/prod output -raw api_url | pnpm exec wrangler secret put API_ORIGIN
  terraform -chdir=../../infra/envs/prod output -raw origin_secret | pnpm exec wrangler secret put ORIGIN_SECRET
  ```
- `ORIGIN_SECRET`을 바꿀 때는 `terraform apply -replace=random_password.origin_secret` → 위 명령으로 Worker secret 갱신 → `gcloud run services update yeojeong-api --region asia-northeast3 --update-labels origin-secret-rotated=<날짜>`로 새 리비전을 띄웁니다. 그 사이 잠깐 403이 날 수 있습니다.
- Cloudflare가 기본으로 넣는 Web Analytics 스크립트는 CSP에 막히고 개인정보 원칙에도 맞지 않아 이 zone에서 자동 삽입을 껐습니다. 이 설정은 계정 전체 권한이 필요해서 Terraform 밖(대시보드)에서 관리합니다.

#### API (Cloud Run)

`main`에 API 관련 변경이 push되면 `.github/workflows/deploy-api.yml`이 이미지를 빌드해 Artifact Registry에 올리고 Cloud Run에 배포합니다.

- 인증은 Workload Identity Federation으로 하며, 서비스 계정 키는 쓰지 않습니다. 이 레포의 `main` 브랜치에서만 허용됩니다.
- 프로젝트 ID 같은 값은 레포 변수(`gh variable list`)에 있습니다.
- Terraform은 CI에서 돌리지 않고 로컬에서만 적용합니다.
