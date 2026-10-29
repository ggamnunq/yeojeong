-- 카드 승인내역 추가 인증 이어가기(S8 보안 리뷰 M1): 토큰 nonce 해시별 시도 수(상한 3)·남은 예약 호출 수. 내용 없음.

-- CreateTable
CREATE TABLE "card_import_two_way_sessions" (
    "nonce_hash" CHAR(64) NOT NULL,
    "user_id" UUID NOT NULL,
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "calls_left" INTEGER NOT NULL,
    "budget_day" DATE NOT NULL,
    "expires_at" TIMESTAMPTZ NOT NULL,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "card_import_two_way_sessions_pkey" PRIMARY KEY ("nonce_hash")
);

-- CreateIndex
CREATE INDEX "card_import_two_way_sessions_expires_at_idx" ON "card_import_two_way_sessions"("expires_at");

-- AddForeignKey
ALTER TABLE "card_import_two_way_sessions" ADD CONSTRAINT "card_import_two_way_sessions_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
