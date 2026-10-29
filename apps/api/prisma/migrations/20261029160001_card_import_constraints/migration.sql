-- 카드 승인내역 불러오기(S8): 출처별 필수 값·중복 방지·동의 문서 초안.
-- 조회 결과는 저장하지 않는다. 사용자가 고른 승인 건만 transactions(source = CARD_IMPORT)로 들어온다.
-- CARD_IMPORT 행: 결제수단·원문 없음, external_ref = importKey(HMAC-SHA256 hex, 승인번호 원문 아님).

-- 출처별 필수 값(20261029140000_add_manual_entries의 검사에 CARD_IMPORT를 더한다)
ALTER TABLE "transactions" DROP CONSTRAINT "transactions_source_check";
ALTER TABLE "transactions" ADD CONSTRAINT "transactions_source_check" CHECK (
  ("source" = 'PROVIDER' AND "payment_method_id" IS NOT NULL AND "external_ref" IS NOT NULL)
  OR ("source" = 'MANUAL' AND "payment_method_id" IS NULL AND "raw_payload_enc" IS NULL)
  OR ("source" = 'CARD_IMPORT' AND "payment_method_id" IS NULL AND "raw_payload_enc" IS NULL AND "external_ref" IS NOT NULL)
);

-- 같은 승인 건을 두 번 저장하지 않는다(사용자마다). 다른 출처 행에는 영향이 없다(부분 인덱스).
-- Prisma 스키마로 표현할 수 없어 여기에만 있다(schema.prisma Transaction.externalRef 주석)
CREATE UNIQUE INDEX "transactions_card_import_ref_key" ON "transactions"("user_id", "external_ref") WHERE "source" = 'CARD_IMPORT';

-- 동의 문서 초안(0.1-draft). 전문은 법무 검토 뒤 docs/legal에 올리고 정식본 행을 새 마이그레이션으로 추가한다
-- (정식본이 생기면 초안 동의는 무효가 되어 불러오기 전에 다시 동의를 받는다 — common/auth/consent-catalog.ts).
-- doc_hash는 아직 전문이 없어 아래 summary 문장(UTF-8)의 SHA-256이다.
INSERT INTO "consent_documents" ("consent_id", "version", "title", "required", "doc_path", "doc_hash", "effective_at", "change_type", "summary", "is_draft")
VALUES
  ('CARD_IMPORT', '0.1-draft', '카드 승인내역 불러오기', true, 'docs/legal/카드 승인내역 불러오기 동의서.md', 'b21259dea64a8caaf60564f52967c940214eb12c4fa2aff947447c3c89e041a8', '2026-10-29T00:00:00+09:00', 'MAJOR', '카드사 로그인 정보로 승인내역을 한 번 조회하고, 고른 결제만 지갑에 저장해요. 로그인 정보와 조회 결과는 저장하지 않아요.', true)
ON CONFLICT ("consent_id", "version") DO NOTHING;
