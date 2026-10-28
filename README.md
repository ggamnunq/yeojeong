# 여정

여행 공동 지갑 웹앱.

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
