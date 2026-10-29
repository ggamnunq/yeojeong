-- 공동 결제의 원본 제공자 거래 HMAC(기능명세 4-10 v0.5.7, S4).
-- 결제수단 전부 해제로 거래 원본을 지워 transactionId가 NULL이 돼도, 다시 연결한 뒤 같은 거래를 새 미확정으로 들이지 않게 인입이 이 값으로 건너뛴다.
-- nullable 추가 + 인덱스라 옛 리비전은 영향이 없다. 기존 공동 결제는 전부 해제 처리 때 거래를 지우기 전에 채운다(채우는 마이그레이션 없음).

-- AlterTable
ALTER TABLE "expenses" ADD COLUMN "source_tx_hash" CHAR(64);

-- CreateIndex
CREATE INDEX "expenses_trip_id_source_tx_hash_idx" ON "expenses"("trip_id", "source_tx_hash");

ALTER TABLE "expenses" ADD CONSTRAINT "expenses_source_tx_hash_check" CHECK ("source_tx_hash" ~ '^[0-9a-f]{64}$');
