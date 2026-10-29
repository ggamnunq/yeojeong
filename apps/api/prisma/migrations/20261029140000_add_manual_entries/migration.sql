-- 수동 결제(S7): 지갑에 직접 입력한 거래(transactions.source = MANUAL)와 여정에 직접 추가한 결제(expenses.origin = MANUAL).
-- expand만 한다(하위 호환): enum 값·nullable 컬럼·기본값 있는 컬럼·인덱스 추가, NOT NULL 해제.
-- 옛 리비전은 MANUAL 행을 만들지 않고, 새 리비전이 뜨기 전에는 MANUAL 행이 없다. 새 enum 값은 이 마이그레이션 안에서 쓰지 않는다.

-- CreateEnum
CREATE TYPE "tx_source" AS ENUM ('PROVIDER', 'MANUAL');

-- AlterEnum
ALTER TYPE "change_action" ADD VALUE 'MANUAL_ADDED';
ALTER TYPE "change_action" ADD VALUE 'MANUAL_EDITED';

-- AlterEnum
ALTER TYPE "expense_origin" ADD VALUE 'MANUAL';

-- AlterTable: 작성자·중복 제출 방지 키(여정에서 추가)
ALTER TABLE "expenses" ADD COLUMN     "client_request_id" UUID,
ADD COLUMN     "created_by_membership_id" UUID;

-- AlterTable: 출처·중복 제출 방지 키·낙관적 잠금. MANUAL은 결제수단·제공자 거래 ID가 없다
ALTER TABLE "transactions" ADD COLUMN     "client_request_id" UUID,
ADD COLUMN     "source" "tx_source" NOT NULL DEFAULT 'PROVIDER',
ADD COLUMN     "version" INTEGER NOT NULL DEFAULT 0,
ALTER COLUMN "payment_method_id" DROP NOT NULL,
ALTER COLUMN "external_ref" DROP NOT NULL;

-- CreateIndex (NULL끼리는 겹치지 않으므로 키가 없는 행·가져온 결제에는 영향이 없다)
CREATE UNIQUE INDEX "expenses_created_by_membership_id_client_request_id_key" ON "expenses"("created_by_membership_id", "client_request_id");

-- CreateIndex
CREATE UNIQUE INDEX "transactions_user_id_client_request_id_key" ON "transactions"("user_id", "client_request_id");

-- AddForeignKey
ALTER TABLE "expenses" ADD CONSTRAINT "expenses_created_by_membership_id_fkey" FOREIGN KEY ("created_by_membership_id") REFERENCES "memberships"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- 출처별 필수 값. 기존 행은 모두 PROVIDER이고 payment_method_id·external_ref가 채워져 있다(이전까지 NOT NULL)
ALTER TABLE "transactions" ADD CONSTRAINT "transactions_source_check" CHECK (
  ("source" = 'PROVIDER' AND "payment_method_id" IS NOT NULL AND "external_ref" IS NOT NULL)
  OR ("source" = 'MANUAL' AND "payment_method_id" IS NULL AND "raw_payload_enc" IS NULL)
);
