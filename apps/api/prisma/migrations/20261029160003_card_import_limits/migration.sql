-- 카드 승인내역 불러오기(S8) 호출 보호: 사용자별 동시 1건 잠금, 로그인 연속 실패 수, 서비스 전체 CODEF 일일 호출 수.
-- 사용자 ID·날짜·개수·기관 코드만 둔다(내역·로그인 정보 없음). 오래된 행은 파기 배치(CARD_IMPORT_COUNTERS)가 지운다.

-- CreateTable
CREATE TABLE "card_import_locks" (
    "user_id" UUID NOT NULL,
    "expires_at" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "card_import_locks_pkey" PRIMARY KEY ("user_id")
);

-- CreateTable
CREATE TABLE "card_import_login_failures" (
    "user_id" UUID NOT NULL,
    "organization" CHAR(4) NOT NULL,
    "failures" INTEGER NOT NULL,
    "last_failed_at" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "card_import_login_failures_pkey" PRIMARY KEY ("user_id","organization")
);

-- CreateTable
CREATE TABLE "codef_daily_usage" (
    "day" DATE NOT NULL,
    "calls" INTEGER NOT NULL DEFAULT 0,
    "updated_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "codef_daily_usage_pkey" PRIMARY KEY ("day")
);

-- CreateIndex
CREATE INDEX "card_import_login_failures_last_failed_at_idx" ON "card_import_login_failures"("last_failed_at");

-- AddForeignKey
ALTER TABLE "card_import_locks" ADD CONSTRAINT "card_import_locks_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "card_import_login_failures" ADD CONSTRAINT "card_import_login_failures_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
