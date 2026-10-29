-- 카드 승인내역 불러오기(S8) 권한: 관리자 페이지에서 주고 회수한다(FEATURE_CARD_IMPORT=allowlist일 때 env CARD_IMPORT_ALLOWED_USER_IDS와 합집합).
-- 사용자 ID·부여 시각·부여한 관리자 행위자 ID·짧은 메모만 둔다. 탈퇴하면 함께 지운다(탈퇴 파이프라인 + FK CASCADE).
-- 하위 호환: 새 테이블만 추가한다(옛 리비전은 이 테이블을 읽지 않는다 — env 목록만 본다).

-- CreateTable
CREATE TABLE "card_import_grants" (
    "user_id" UUID NOT NULL,
    "granted_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "granted_by" UUID NOT NULL,
    "note" VARCHAR(100),
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "card_import_grants_pkey" PRIMARY KEY ("user_id")
);

-- AddForeignKey
ALTER TABLE "card_import_grants" ADD CONSTRAINT "card_import_grants_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
