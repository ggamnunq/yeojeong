import { enumObject } from './enum.js';

// 동의 항목의 단일 기준은 docs/legal/consents.md(로컬 전용)다. 문서 버전·해시는 서버가 관리한다.

export const CONSENT_ID_VALUES = [
  'TOS',
  'PRIVACY',
  'AGE14',
  'MARKETING',
  'FIN_LINK',
  'FIN_PRIVACY',
  'THIRD_PARTY',
  'CARD_IMPORT',
] as const;
export type ConsentId = (typeof CONSENT_ID_VALUES)[number];
export const ConsentId = enumObject(CONSENT_ID_VALUES);

export const CONSENT_STAGE_VALUES = ['SIGNUP', 'FIN_LINK', 'CARD_IMPORT'] as const;
/** 동의를 받는 시점: 가입(WF-04) · 금융정보 연동(WF-05b) · 카드 승인내역 불러오기(S8, 최초 1회) */
export type ConsentStage = (typeof CONSENT_STAGE_VALUES)[number];
export const ConsentStage = enumObject(CONSENT_STAGE_VALUES);

export const CONSENT_METHOD_VALUES = ['ALL', 'INDIVIDUAL', 'TOGGLE'] as const;
/** 전체 동의 · 개별 체크 · 설정 화면 토글 */
export type ConsentMethod = (typeof CONSENT_METHOD_VALUES)[number];
export const ConsentMethod = enumObject(CONSENT_METHOD_VALUES);

export const CONSENT_SCREEN_VALUES = [
  'WF-04',
  'WF-05',
  'WF-28',
  'WF-42',
  'WF-30',
  'RECONSENT',
  'SUPPORT',
  'CARD_IMPORT',
] as const;
/** 동의를 받은 화면(UserConsent.screen) */
export type ConsentScreen = (typeof CONSENT_SCREEN_VALUES)[number];

export const WITHDRAW_CHANNEL_VALUES = [
  'WF-30',
  'WF-27',
  'SUPPORT',
  'ACCOUNT_DELETED',
  /** 동의 관리 화면(철회 가능한 동의 목록) */
  'HF-58',
] as const;
export type WithdrawChannel = (typeof WITHDRAW_CHANNEL_VALUES)[number];

export interface ConsentDefinition {
  id: ConsentId;
  /** 화면 제목 */
  title: string;
  required: boolean;
  stage: ConsentStage;
  /** 화면에 노출하지 않는 항목(MARKETING: 발송 채널이 생길 때까지 숨김) */
  hidden: boolean;
  /** 전문을 여는 공개 경로. 없으면 행에 ›를 두지 않는다 */
  docUrl: string | null;
}

export const CONSENT_DEFINITIONS = {
  TOS: {
    id: 'TOS',
    title: '서비스 이용약관',
    required: true,
    stage: 'SIGNUP',
    hidden: false,
    docUrl: '/terms',
  },
  PRIVACY: {
    id: 'PRIVACY',
    title: '개인정보 수집·이용',
    required: true,
    stage: 'SIGNUP',
    hidden: false,
    docUrl: '/consents/PRIVACY',
  },
  AGE14: {
    id: 'AGE14',
    title: '만 14세 이상입니다',
    required: true,
    stage: 'SIGNUP',
    hidden: false,
    docUrl: null,
  },
  MARKETING: {
    id: 'MARKETING',
    title: '마케팅 정보 수신',
    required: false,
    stage: 'SIGNUP',
    hidden: true,
    docUrl: '/consents/MARKETING',
  },
  FIN_LINK: {
    id: 'FIN_LINK',
    title: '금융정보 연동 약관',
    required: true,
    stage: 'FIN_LINK',
    hidden: false,
    docUrl: '/consents/FIN_LINK',
  },
  FIN_PRIVACY: {
    id: 'FIN_PRIVACY',
    title: '금융정보 수집·이용',
    required: true,
    stage: 'FIN_LINK',
    hidden: false,
    docUrl: '/consents/FIN_PRIVACY',
  },
  THIRD_PARTY: {
    id: 'THIRD_PARTY',
    title: '공동 결제 그룹 공개',
    required: true,
    stage: 'FIN_LINK',
    hidden: false,
    docUrl: '/consents/THIRD_PARTY',
  },
  CARD_IMPORT: {
    id: 'CARD_IMPORT',
    title: '카드 승인내역 불러오기',
    required: true,
    stage: 'CARD_IMPORT',
    hidden: false,
    docUrl: '/consents/CARD_IMPORT',
  },
} as const satisfies Record<ConsentId, ConsentDefinition>;

/** 가입(WF-04)에서 반드시 받아야 하는 항목. 로그인 상태의 모든 요청에서 서버가 확인한다 */
export const SIGNUP_REQUIRED_CONSENTS = [
  'TOS',
  'PRIVACY',
  'AGE14',
] as const satisfies readonly ConsentId[];

/** 결제수단 연결(WF-05b) 때 받는 항목. 연결·재연결·지갑 추가 API에서 @RequireConsents로 확인한다 */
export const FIN_LINK_REQUIRED_CONSENTS = [
  'FIN_LINK',
  'FIN_PRIVACY',
  'THIRD_PARTY',
] as const satisfies readonly ConsentId[];

/** 카드 승인내역 불러오기(S8) 전에 받는 항목. POST /api/card-import/fetch가 @RequireConsents로 확인한다 */
export const CARD_IMPORT_REQUIRED_CONSENTS = [
  'CARD_IMPORT',
] as const satisfies readonly ConsentId[];

/**
 * 사용자가 동의 관리 화면(HF-58)에서 직접 철회할 수 있는 항목. 가입 필수 항목은 탈퇴로만, 연동 동의(FIN_*)는 결제수단 전부 해제로 철회된다.
 * 철회해도 이미 저장한 지갑 항목은 그대로 남는다(다음 불러오기 전에 다시 동의를 받는다)
 */
export const REVOCABLE_CONSENTS = [
  'CARD_IMPORT',
] as const satisfies readonly ConsentId[];
export type RevocableConsentId = (typeof REVOCABLE_CONSENTS)[number];

/** 403 CONSENT_REQUIRED의 details에 담기는 항목 하나 */
export interface ConsentRequirement {
  id: ConsentId;
  /** 지금 동의해야 하는 문서 버전(시행일 YYYY-MM-DD) */
  version: string;
}

/** 403 CONSENT_REQUIRED 응답의 details */
export interface ConsentRequiredDetails extends Record<string, unknown> {
  missing: ConsentId[];
  required: ConsentRequirement[];
  /**
   * 동의 외의 이유가 있을 때만. `NO_ACTIVE_PAYMENT_METHOD` = 결제자의 활성 결제수단이 0개라(결제수단 전부 해제 → 연동 동의 철회)
   * 공개를 넓히는 변경(PENDING·PERSONAL → SHARED, 부담 인원 추가)을 받을 수 없다. 다시 연결하면 풀린다(기능명세 4-10 v0.5.7)
   */
  reason?: ConsentRequiredReason;
}

export const CONSENT_REQUIRED_REASON_VALUES = [
  'NO_ACTIVE_PAYMENT_METHOD',
] as const;
export type ConsentRequiredReason =
  (typeof CONSENT_REQUIRED_REASON_VALUES)[number];
