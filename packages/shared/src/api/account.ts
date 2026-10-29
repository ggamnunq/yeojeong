import { enumObject } from '../enum.js';

// 서비스 내 탈퇴(기능명세 FR-109)와 파기 배치(8-8) 타입. 서버 구현은 apps/api/src/account, src/retention.

/**
 * DELETE /api/users/me 본문. 탈퇴 확인 다이얼로그(부록 C-13)에서 "탈퇴"를 눌렀을 때만 보낸다.
 * 비밀값이 없는 재확인 플래그라 실수로 부른 요청(본문 없음)을 막는 용도다. CSRF는 Origin 검사가 따로 막는다.
 * 성공하면 204 + 세션 쿠키 삭제. 화면은 로그인 화면(WF-02)으로 보낸다.
 */
export interface DeleteAccountRequest {
  confirm: true;
}

/**
 * 탈퇴한 회원의 멤버십(userId = NULL)을 보여 줄 때 쓰는 이름. 프사는 기본 이미지(profileImageUrl = null).
 * 공동 결제·부담·정산 행은 이 이름으로 남는다(처리방침 제7조⑤, 기능명세 FR-109).
 */
export const DELETED_MEMBER_NICKNAME = '탈퇴한 멤버';

export const ACCOUNT_DELETION_CHANNEL_VALUES = [
  'SUPPORT',
  'IN_APP',
  'KAKAO_UNLINK',
  'INACTIVE',
] as const;
/**
 * AccountDeletion.channel. 고객센터 요청 코드(FR-108) · 서비스 내 탈퇴(FR-109) ·
 * 카카오 연결 끊기(미결 Q-32) · 장기 미이용 3년(8-8 7단계)
 */
export type AccountDeletionChannel =
  (typeof ACCOUNT_DELETION_CHANNEL_VALUES)[number];
export const AccountDeletionChannel = enumObject(
  ACCOUNT_DELETION_CHANNEL_VALUES,
);

export const PURGE_STEP_VALUES = [
  'SOFT_DELETED_GROUPS',
  'EXPIRED_GROUP_RECORDS',
  'RAW_PAYLOADS',
  'CONNECTION_ATTEMPTS',
  'SIGNUP_TICKETS',
  'SESSIONS',
  'REMOVED_PAYMENT_METHODS',
  'REVOKED_CONNECTIONS',
  'INACTIVE_USERS',
  'USER_CONSENTS',
  'CONSENT_IP_PLAINTEXT',
  'ACCESS_LOGS',
  'ACCOUNT_DELETIONS',
] as const;
/** 파기 배치 단계. 순서와 기준은 apps/api/src/retention/README.md */
export type PurgeStep = (typeof PURGE_STEP_VALUES)[number];
export const PurgeStep = enumObject(PURGE_STEP_VALUES);

/** POST /api/internal/jobs/purge 본문(내부 잡) */
export interface PurgeJobRequest {
  /** true면 지우지 않고 대상 건수만 센다 */
  dryRun?: boolean;
}

export interface PurgeStepResult {
  step: PurgeStep;
  /** 지운(드라이런이면 지울) 행 수. 그룹 단계는 그룹 수, 회원 단계는 회원 수 */
  count: number;
  /** 한 번에 처리하는 상한에 걸려 남은 대상이 있으면 true. 다음 실행이 이어서 지운다 */
  hasMore: boolean;
  /**
   * LOCKED = 다른 실행이 잠금을 쥐고 있어 건너뜀.
   * NO_KEY = AUDIT_HMAC_KEY가 없어 동의 기록 IP 평문을 해시로 바꾸지 못함(평문은 그대로 둔다)
   */
  skipped?: 'LOCKED' | 'NO_KEY';
}

export interface PurgeJobResult {
  dryRun: boolean;
  /** ISO 8601 */
  startedAt: string;
  finishedAt: string;
  steps: PurgeStepResult[];
}

/** POST /api/internal/jobs/consent-ip-backfill 응답(내부 잡, 동의 기록 IP 평문 → HMAC 이관) */
export interface ConsentIpBackfillResult {
  /** 이번 실행에서 해시로 바꾸고 평문을 지운 행 수 */
  hashed: number;
  /** 실행 뒤 남은 평문 행 수. 0이면 contract(평문 컬럼 DROP) 조건을 만족한다 */
  remaining: number;
  /** AUDIT_HMAC_KEY가 없어 아무것도 바꾸지 않은 경우 */
  skipped?: 'NO_KEY';
}
