-- CODEF 계정 삭제 대기(S8, CODEF_LOGIN_MODE=account 전용). 요청 안에서 3번 재시도해도 지우지 못한 connectedId만 암호화해 둔다.
-- 삭제 재시도에만 쓰고 조회에는 쓰지 않는다. 사용자 ID는 두지 않는다.

-- CreateTable
CREATE TABLE "codef_pending_deletions" (
    "id" UUID NOT NULL,
    "connected_id_enc" BYTEA NOT NULL,
    "organization" CHAR(4) NOT NULL,
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "last_error_code" VARCHAR(16),
    "last_tried_at" TIMESTAMPTZ,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "codef_pending_deletions_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "codef_pending_deletions_created_at_idx" ON "codef_pending_deletions"("created_at");
