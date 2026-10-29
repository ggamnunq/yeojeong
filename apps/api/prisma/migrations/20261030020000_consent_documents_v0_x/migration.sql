-- 이 파일은 apps/web/scripts/sync-legal.mjs가 만든다 — 손으로 고치지 않는다. 운영에 적용한 뒤에는 고치지 말고 새 마이그레이션으로 낸다.
-- 약관·동의 문서 버전을 0.x로 다시 매긴다(L-1b). 게시본 1.0 = 0.1(시행 2026-10-30 그대로), 다음 판 0.2(docs/legal/releases.json).
-- 1) 재동의 판정을 버전 번호(MAJOR 비교)가 아니라 버전별 reconsent_required로 한다(0.x는 MAJOR가 늘 0). 기존 행은 change_type으로 채운다.
-- 2) replaces_version: 같은 문서의 구 표기. 0.1 행은 구 1.0을 대신한다 — 1.0으로 받은 동의(user_consents.version = '1.0')를 0.1 동의로 본다.
--    user_consents는 고치지 않는다(append-only 동의 증거: 당시 버전 표기·당시 문서 해시 그대로). 1.0 행도 지우지 않는다(당시 게시 기록).
-- 3) 0.x 행: doc_hash = 게시본(apps/web/src/features/legal/content/v<판>/*.md, 게시일을 채운 것) SHA-256. change_type은 기록용(reconsent_required와 같게).
ALTER TABLE "consent_documents" ADD COLUMN "reconsent_required" BOOLEAN;
UPDATE "consent_documents" SET "reconsent_required" = ("change_type" = 'MAJOR');
ALTER TABLE "consent_documents" ALTER COLUMN "reconsent_required" SET NOT NULL;
ALTER TABLE "consent_documents" ADD COLUMN "replaces_version" VARCHAR(16);

INSERT INTO "consent_documents" ("consent_id", "version", "title", "required", "doc_path", "doc_hash", "effective_at", "change_type", "summary", "is_draft", "reconsent_required", "replaces_version")
VALUES
  ('TOS', '0.1', '서비스 이용약관', true, 'docs/legal/v0.1/서비스 이용약관.md', '85fba61427bc5b15d241aea542fb7ea5159a611548dbd49ec54c821d2ae90142', '2026-10-30T00:00:00+09:00', 'MAJOR', '정식 약관 0.1(구 표기 1.0) 시행 — 수동 결제·지갑·공동 결제 공개 범위 반영, 연동·카드 불러오기·마케팅 제외', false, true, '1.0'),
  ('PRIVACY', '0.1', '개인정보 수집·이용', true, 'docs/legal/v0.1/개인정보 수집·이용 동의서.md', 'a7c0412b377ca2977bd15c8d4c626f0076646143df183ab7b18d700210028a72', '2026-10-30T00:00:00+09:00', 'MAJOR', '정식 약관 0.1(구 표기 1.0) 시행 — 수동 결제·지갑·공동 결제 공개 범위 반영, 연동·카드 불러오기·마케팅 제외', false, true, '1.0'),
  ('AGE14', '0.1', '만 14세 이상입니다', true, 'docs/legal/v0.1/서비스 이용약관.md', '85fba61427bc5b15d241aea542fb7ea5159a611548dbd49ec54c821d2ae90142', '2026-10-30T00:00:00+09:00', 'MAJOR', '정식 약관 0.1(구 표기 1.0) 시행 — 수동 결제·지갑·공동 결제 공개 범위 반영, 연동·카드 불러오기·마케팅 제외', false, true, '1.0'),
  ('TOS', '0.2', '서비스 이용약관', true, 'docs/legal/v0.2/서비스 이용약관.md', '3f95a26a9ae9118775f3433b8b8f55bcf22ac16356373279c03a8a0942c9847e', '2026-11-06T00:00:00+09:00', 'MINOR', '약관 0.2 — 사실 정정, 카드 승인내역 불러오기 반영', false, false, NULL),
  ('PRIVACY', '0.2', '개인정보 수집·이용', true, 'docs/legal/v0.2/개인정보 수집·이용 동의서.md', '633801d93fa52512209d963b8da2fb2bed0489ac04e9fd98d1918d9bbef85c7e', '2026-10-30T00:00:00+09:00', 'MINOR', '약관 0.2 — 사실 정정, 카드 승인내역 불러오기 반영', false, false, NULL),
  ('CARD_IMPORT', '0.1', '카드 승인내역 불러오기', true, 'docs/legal/v0.2/카드 내역 조회 동의서.md', 'ba84ffe7075b1d1f4784e2b1ebdb632c45225d6db1a37afb53f4e783f40505e2', '2026-10-30T00:00:00+09:00', 'MAJOR', '약관 0.2 — 사실 정정, 카드 승인내역 불러오기 반영', false, true, NULL)
ON CONFLICT ("consent_id", "version") DO NOTHING;
