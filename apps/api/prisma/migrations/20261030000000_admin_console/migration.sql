-- 운영자 관리자 페이지(ADMIN): 관리자 세션, 로그인 시도 제한 카운터, TOTP 재사용 금지 카운터, CODEF 현황 집계용 접근 기록 인덱스.
-- access_logs 인덱스는 CONCURRENTLY 없이 만든다: Prisma가 마이그레이션을 트랜잭션으로 돌려 CONCURRENTLY를 쓸 수 없고, 출시 전이라 테이블이 작아 잠금이 짧다.
-- 관리자 세션은 사용자 세션(sessions)과 별개 테이블이다. 쿠키 값 원문·비밀번호·아이디는 저장하지 않는다(토큰 SHA-256·IP HMAC만).

-- CreateTable
CREATE TABLE "admin_sessions" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "token_hash" CHAR(64) NOT NULL,
    "credential_tag" CHAR(64) NOT NULL,
    "last_seen_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expires_at" TIMESTAMPTZ NOT NULL,
    "revoked_at" TIMESTAMPTZ,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "admin_sessions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "admin_login_throttles" (
    "key" VARCHAR(80) NOT NULL,
    "attempts" INTEGER NOT NULL,
    "window_started_at" TIMESTAMPTZ NOT NULL,
    "updated_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "admin_login_throttles_pkey" PRIMARY KEY ("key")
);

-- CreateTable
CREATE TABLE "admin_totp_counters" (
    "actor_id" UUID NOT NULL,
    "last_counter" BIGINT NOT NULL,
    "updated_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "admin_totp_counters_pkey" PRIMARY KEY ("actor_id")
);

-- CreateIndex
CREATE UNIQUE INDEX "admin_sessions_token_hash_key" ON "admin_sessions"("token_hash");

-- CreateIndex
CREATE INDEX "admin_sessions_expires_at_idx" ON "admin_sessions"("expires_at");

-- CreateIndex
CREATE INDEX "access_logs_action_at_idx" ON "access_logs"("action", "at");
