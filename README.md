# 여정

여행 공동 지갑 웹앱.

보안 원칙은 [docs/security.md](docs/security.md), 취약점 신고는 [SECURITY.md](SECURITY.md)를 참고하세요.

## 구조

```
apps/web            화면 (React + Vite + TypeScript + Tailwind CSS)
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
| `pnpm test`                              | API 단위 테스트 + e2e 테스트      |
| `pnpm db:down`                           | DB 중지 (데이터는 볼륨에 남음)    |
| `pnpm --filter @yeojeong/api db:migrate` | Prisma 스키마 변경을 DB에 반영    |

## 배포

API 이미지는 레포 루트에서 빌드합니다.

```bash
docker build -f apps/api/Dockerfile -t yeojeong-api .
```

실행할 때 `DATABASE_URL`이 필요합니다. 화면과 API를 서로 다른 도메인에 올리면 API에는 `WEB_ORIGIN`, 화면 빌드에는 `VITE_API_URL`을 설정합니다.

## 인프라

API는 Google Cloud Run(서울), DB는 Supabase(서울)에 있고 Terraform으로 관리합니다.

```
infra/bootstrap   GCP 프로젝트, 결제 연결, Terraform state 버킷 (처음 한 번, state는 로컬)
infra/envs/prod   Cloud Run, Artifact Registry, Secret Manager, Supabase 설정,
                  GitHub Actions용 Workload Identity, 예산 알림 (state는 GCS)
```

### 준비

- `gcloud auth login`으로 로그인합니다. Terraform은 ADC 대신 gcloud 토큰을 씁니다.
- Supabase 개인 토큰은 대시보드 Account → Access Tokens에서 만들고 macOS 키체인에 저장합니다.
  ```bash
  security add-generic-password -a "$USER" -s yeojeong-supabase-pat -w '<토큰>'
  ```
- 각 폴더의 `terraform.tfvars.example`을 `terraform.tfvars`로 복사해 값을 채웁니다. tfvars와 state는 커밋하지 않습니다.

### 적용

```bash
export GOOGLE_OAUTH_ACCESS_TOKEN=$(gcloud auth print-access-token)
export SUPABASE_ACCESS_TOKEN=$(security find-generic-password -a "$USER" -s yeojeong-supabase-pat -w)

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

`main`에 API 관련 변경이 push되면 `.github/workflows/deploy-api.yml`이 이미지를 빌드해 Artifact Registry에 올리고 Cloud Run에 배포합니다.

- 인증은 Workload Identity Federation으로 하며, 서비스 계정 키는 쓰지 않습니다. 이 레포의 `main` 브랜치에서만 허용됩니다.
- 프로젝트 ID 같은 값은 레포 변수(`gh variable list`)에 있습니다.
- Terraform은 CI에서 돌리지 않고 로컬에서만 적용합니다.
