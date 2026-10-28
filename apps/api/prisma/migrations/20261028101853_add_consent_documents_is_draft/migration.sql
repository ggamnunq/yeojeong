-- AlterTable
ALTER TABLE "consent_documents" ADD COLUMN     "is_draft" BOOLEAN NOT NULL DEFAULT false;

-- 약관 초안(docs/legal 0.1-draft)을 모든 환경에 넣는다. 시행일이 정해지기 전에도 가입을 막지 않기 위해서다.
-- 초안 동의는 법적 유효 동의가 아니다. 정식본(is_draft = false)을 새 마이그레이션으로 추가하면 초안에 동의한 회원 모두에게
-- 403 CONSENT_REQUIRED가 나가 재동의(FR-107)를 받는다. doc_hash는 docs/legal 초안 파일 전체의 SHA-256이다.
INSERT INTO "consent_documents" ("consent_id", "version", "title", "required", "doc_path", "doc_hash", "effective_at", "change_type", "summary", "is_draft")
VALUES
  ('TOS', '0.1-draft', '서비스 이용약관', true, 'docs/legal/서비스 이용약관.md', 'a3c2aef236bb1cc2577467871db229de8eac1697376a18b384d9cb26a5b8a1f3', '2026-10-28T00:00:00+09:00', 'MAJOR', NULL, true),
  ('PRIVACY', '0.1-draft', '개인정보 수집·이용', true, 'docs/legal/개인정보 수집·이용 동의서.md', '3007c0eae2df11b560ce7f740fe4e13eeee9fbca3804373ab1883932e0373f22', '2026-10-28T00:00:00+09:00', 'MAJOR', NULL, true),
  ('AGE14', '0.1-draft', '만 14세 이상입니다', true, 'docs/legal/서비스 이용약관.md', 'a3c2aef236bb1cc2577467871db229de8eac1697376a18b384d9cb26a5b8a1f3', '2026-10-28T00:00:00+09:00', 'MAJOR', NULL, true),
  ('MARKETING', '0.1-draft', '마케팅 정보 수신', false, 'docs/legal/개인정보 수집·이용 동의서.md', '3007c0eae2df11b560ce7f740fe4e13eeee9fbca3804373ab1883932e0373f22', '2026-10-28T00:00:00+09:00', 'MAJOR', NULL, true),
  ('FIN_LINK', '0.1-draft', '금융정보 연동 약관', true, 'docs/legal/금융정보 연동 이용약관(부속약관).md', '12754e9251e8aa2313ed9fa7adabbf617d002b394b803c48b7837ce355b5a01a', '2026-10-28T00:00:00+09:00', 'MAJOR', NULL, true),
  ('FIN_PRIVACY', '0.1-draft', '금융정보 수집·이용', true, 'docs/legal/개인정보 수집·이용 동의서.md', '3007c0eae2df11b560ce7f740fe4e13eeee9fbca3804373ab1883932e0373f22', '2026-10-28T00:00:00+09:00', 'MAJOR', NULL, true),
  ('THIRD_PARTY', '0.1-draft', '공동 결제 그룹 공개', true, 'docs/legal/개인정보 제3자 제공 동의서.md', '3139434ccc3e99aaa30efcbe7941f4fc1eeef295d355e720de43dfda1b065ff9', '2026-10-28T00:00:00+09:00', 'MAJOR', NULL, true)
ON CONFLICT ("consent_id", "version") DO NOTHING;
