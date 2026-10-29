-- 정식 약관 v1.0(출시 게이트 L-1, docs/legal/v1.0). 버전 = 문서 버전 "1.0", 시행일은 effective_at에 따로 둔다(2026-10-30 00:00 KST).
-- is_draft = false · change_type = MAJOR라 시행일부터 0.1-draft(초안)에 동의한 회원은 모두 403 CONSENT_REQUIRED → 재동의(FR-107)를 받는다.
-- 시행일 전에는 초안이 그대로 현재 버전이다(consent-catalog.ts: effective_at <= now인 정식본만 본다).
-- doc_hash = 게시본(apps/web/src/features/legal/content/*.md = docs/legal/v1.0 원문, 시행일 채움) 파일 전체의 SHA-256.
-- AGE14는 별도 전문이 없어 근거 조항(제7조)이 있는 이용약관 파일의 해시를 쓴다(docs/legal/v1.0/consents.md 1절).
-- v1.0에 없는 동의(MARKETING·FIN_LINK·FIN_PRIVACY·THIRD_PARTY·CARD_IMPORT)는 초안 행을 그대로 둔다(consents.md 5절).
INSERT INTO "consent_documents" ("consent_id", "version", "title", "required", "doc_path", "doc_hash", "effective_at", "change_type", "summary", "is_draft")
VALUES
  ('TOS', '1.0', '서비스 이용약관', true, 'docs/legal/v1.0/서비스 이용약관.md', '97b15008160a8e381efb66222f27487b316d1925c01e6fe54c114cc1aabd7c58', '2026-10-30T00:00:00+09:00', 'MAJOR', '정식 약관 v1.0 시행 — 수동 결제·지갑·공동 결제 공개 범위 반영, 연동·카드 불러오기·마케팅 제외', false),
  ('PRIVACY', '1.0', '개인정보 수집·이용', true, 'docs/legal/v1.0/개인정보 수집·이용 동의서.md', 'ad74dea6c6372da76c72bdd546b389e66815e4da6af15ed66cde1addfe33cfd6', '2026-10-30T00:00:00+09:00', 'MAJOR', '정식 약관 v1.0 시행 — 수동 결제·지갑·공동 결제 공개 범위 반영, 연동·카드 불러오기·마케팅 제외', false),
  ('AGE14', '1.0', '만 14세 이상입니다', true, 'docs/legal/v1.0/서비스 이용약관.md', '97b15008160a8e381efb66222f27487b316d1925c01e6fe54c114cc1aabd7c58', '2026-10-30T00:00:00+09:00', 'MAJOR', '정식 약관 v1.0 시행 — 수동 결제·지갑·공동 결제 공개 범위 반영, 연동·카드 불러오기·마케팅 제외', false)
ON CONFLICT ("consent_id", "version") DO NOTHING;
