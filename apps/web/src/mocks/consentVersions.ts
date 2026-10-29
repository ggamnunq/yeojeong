import { LEGAL_CONSENT_RELEASES, type ConsentId } from '@yeojeong/shared'

/** 초안 버전(정식 전문이 없는 동의: MARKETING·FIN_*·THIRD_PARTY) */
export const MOCK_DRAFT_VERSION = '0.1-draft'

/**
 * 동의 항목의 지금 시행 버전(목). 0.x 정식본(packages/shared legal-manifest — 서버 consent_documents와 같은 값)의 마지막 판,
 * 정식본이 없으면 초안. 시각과 무관하게 "모든 판이 시행된 뒤"로 본다(목은 시계에 따라 바뀌지 않는다)
 */
export const mockConsentVersion = (id: ConsentId) =>
  LEGAL_CONSENT_RELEASES.filter((r) => r.consentId === id).at(-1)?.version ?? MOCK_DRAFT_VERSION
