-- 거래 내역 파일 가져오기(W10, 위챗페이 등): 출처별 필수 값·중복 방지.
-- 파일은 브라우저에서만 읽는다. 사용자가 고른 결제만 transactions(source = FILE_IMPORT)로 들어온다.
-- FILE_IMPORT 행: 결제수단·원문 없음, external_ref = importKey(HMAC-SHA256 hex, 거래 번호 원문·다이제스트 아님).

-- 출처별 필수 값(20261029160001_card_import_constraints의 검사에 FILE_IMPORT를 더한다)
ALTER TABLE "transactions" DROP CONSTRAINT "transactions_source_check";
ALTER TABLE "transactions" ADD CONSTRAINT "transactions_source_check" CHECK (
  ("source" = 'PROVIDER' AND "payment_method_id" IS NOT NULL AND "external_ref" IS NOT NULL)
  OR ("source" = 'MANUAL' AND "payment_method_id" IS NULL AND "raw_payload_enc" IS NULL)
  OR ("source" = 'CARD_IMPORT' AND "payment_method_id" IS NULL AND "raw_payload_enc" IS NULL AND "external_ref" IS NOT NULL)
  OR ("source" = 'FILE_IMPORT' AND "payment_method_id" IS NULL AND "raw_payload_enc" IS NULL AND "external_ref" IS NOT NULL)
);

-- 같은 거래를 두 번 저장하지 않는다(사용자마다). 다른 출처 행에는 영향이 없다(부분 인덱스).
-- Prisma 스키마로 표현할 수 없어 여기에만 있다(schema.prisma Transaction.externalRef 주석)
CREATE UNIQUE INDEX "transactions_file_import_ref_key" ON "transactions"("user_id", "external_ref") WHERE "source" = 'FILE_IMPORT';
