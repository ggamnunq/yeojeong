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
] as const;
export type ConsentId = (typeof CONSENT_ID_VALUES)[number];
export const ConsentId = enumObject(CONSENT_ID_VALUES);

export const CONSENT_STAGE_VALUES = ['SIGNUP', 'FIN_LINK'] as const;
/** 동의를 받는 시점: 가입(WF-04) · 금융정보 연동(WF-05b) */
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
] as const;
/** 동의를 받은 화면(UserConsent.screen) */
export type ConsentScreen = (typeof CONSENT_SCREEN_VALUES)[number];

export const WITHDRAW_CHANNEL_VALUES = [
  'WF-30',
  'WF-27',
  'SUPPORT',
  'ACCOUNT_DELETED',
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
}
