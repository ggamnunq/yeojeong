-- 회원별 기능 권한(ADMIN3): 회원 × 기능 키마다 한 행. 관리자 페이지 "기능 권한"에서 주고 회수한다.
-- 그 기능의 전역 단계가 allowlist일 때만 쓴다(on은 모두, off는 아무도). 카드 불러오기는 env CARD_IMPORT_ALLOWED_USER_IDS와 합집합.
-- 사용자 ID·기능·부여 시각·부여한 관리자 행위자 ID·짧은 메모만 둔다. 탈퇴하면 함께 지운다(탈퇴 파이프라인 + FK CASCADE).
--
-- 하위 호환(배포 워크플로가 이 마이그레이션을 새 리비전보다 먼저 적용한다 — 그 사이 옛 리비전이 새 스키마 위에서 돈다):
-- - 새 enum·테이블만 더하고 card_import_grants는 그대로 둔다(옛 리비전은 그 테이블만 읽고 쓴다).
-- - 옛 card_import_grants 행을 CARD_IMPORT 권한으로 복사한다. 이미 있으면 건너뛴다(다시 돌려도 안전).
-- - card_import_grants는 이번에 지우지 않는다. 새 코드는 읽지 않고, 회수·탈퇴 때만 함께 지운다
--   (옛 리비전으로 되돌려도 회수한 권한이 되살아나지 않게 — fail closed). 옛 리비전이 더는 돌지 않을 때 별도 마이그레이션으로 지운다.

-- CreateEnum
CREATE TYPE "feature_key" AS ENUM ('CARD_IMPORT', 'FILE_IMPORT_WECHAT', 'FILE_IMPORT_ALIPAY');

-- CreateTable
CREATE TABLE "feature_grants" (
    "user_id" UUID NOT NULL,
    "feature" "feature_key" NOT NULL,
    "granted_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "granted_by" UUID NOT NULL,
    "note" VARCHAR(100),
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "feature_grants_pkey" PRIMARY KEY ("user_id","feature")
);

-- CreateIndex
CREATE INDEX "feature_grants_feature_granted_at_idx" ON "feature_grants"("feature", "granted_at");

-- AddForeignKey
ALTER TABLE "feature_grants" ADD CONSTRAINT "feature_grants_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- CopyCardImportGrants (test/feature-grants-migration.e2e-spec.ts가 이 문장을 그대로 다시 돌려 본다)
INSERT INTO "feature_grants" ("user_id", "feature", "granted_at", "granted_by", "note", "created_at", "updated_at")
SELECT "user_id", 'CARD_IMPORT', "granted_at", "granted_by", "note", "created_at", "updated_at"
FROM "card_import_grants"
ON CONFLICT ("user_id", "feature") DO NOTHING;
