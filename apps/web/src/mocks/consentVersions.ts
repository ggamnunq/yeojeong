import { SIGNUP_REQUIRED_CONSENTS, type ConsentId } from '@yeojeong/shared'

/** 초안 버전(정식 전문이 아직 없는 동의: MARKETING·FIN_*·THIRD_PARTY·CARD_IMPORT) */
export const MOCK_DRAFT_VERSION = '0.1-draft'
/** 정식 약관 v1.0(TOS·PRIVACY·AGE14, 서버 마이그레이션 20261030010000 — 시행일 2026-10-30 이후 상태) */
export const MOCK_CONSENT_VERSION = '1.0'

/** 동의 항목의 지금 시행 버전(목) */
export const mockConsentVersion = (id: ConsentId) =>
  (SIGNUP_REQUIRED_CONSENTS as readonly ConsentId[]).includes(id) ? MOCK_CONSENT_VERSION : MOCK_DRAFT_VERSION
