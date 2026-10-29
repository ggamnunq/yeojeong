import { enumObject } from './enum.js';

// 도메인 enum. 값은 Prisma enum(apps/api/prisma/schema.prisma)과 같다.
// 배열(XXX_VALUES)은 class-validator @IsIn() 등에, 상수(Xxx.VALUE)는 비교에, 타입(Xxx)은 응답 타입에 쓴다.

export const TRIP_STATUS_VALUES = ['UPCOMING', 'ONGOING', 'ENDED'] as const;
/** 시작 전 · 진행 중 · 종료 */
export type TripStatus = (typeof TRIP_STATUS_VALUES)[number];
export const TripStatus = enumObject(TRIP_STATUS_VALUES);

export const END_REASON_VALUES = ['MANUAL', 'AUTO'] as const;
export type EndReason = (typeof END_REASON_VALUES)[number];
export const EndReason = enumObject(END_REASON_VALUES);

export const MEMBER_ROLE_VALUES = ['LEADER', 'MEMBER'] as const;
/** 그룹장 · 멤버 (Membership.role) */
export type MemberRole = (typeof MEMBER_ROLE_VALUES)[number];
export const MemberRole = enumObject(MEMBER_ROLE_VALUES);

export const LEAVE_REASON_VALUES = ['LEFT', 'KICKED', 'ACCOUNT_DELETED', 'GROUP_DELETED'] as const;
export type LeaveReason = (typeof LEAVE_REASON_VALUES)[number];
export const LeaveReason = enumObject(LEAVE_REASON_VALUES);

export const EXPENSE_STATUS_VALUES = ['PENDING', 'PERSONAL', 'SHARED'] as const;
/** 미확정(결제자만) · 개인(결제자만) · 공동(전원, 정산 반영) */
export type ExpenseStatus = (typeof EXPENSE_STATUS_VALUES)[number];
export const ExpenseStatus = enumObject(EXPENSE_STATUS_VALUES);

export const EXPENSE_ORIGIN_VALUES = ['AUTO', 'OUT_OF_PERIOD', 'MANUAL'] as const;
/** AUTO = 가져온 결제(기간 안) · OUT_OF_PERIOD = 기간 외 결제 추가 · MANUAL = 직접 입력(지갑 자동 연결 또는 여정에서 추가). 표시 그룹(여정 전/후)은 origin이 아니라 periodSide로 정한다 */
export type ExpenseOrigin = (typeof EXPENSE_ORIGIN_VALUES)[number];
export const ExpenseOrigin = enumObject(EXPENSE_ORIGIN_VALUES);

export const FX_POLICY_VALUES = [
  'SPOT_AT_PAYMENT',
  'CARD_BILLED',
  'FIXED',
] as const;
export type FxPolicy = (typeof FX_POLICY_VALUES)[number];
export const FxPolicy = enumObject(FX_POLICY_VALUES);

export const PROVIDER_VALUES = ['TOSS', 'DEMO'] as const;
/** 금융 데이터 제공자. DEMO는 개발·시연용 샘플 어댑터 */
export type Provider = (typeof PROVIDER_VALUES)[number];
export const Provider = enumObject(PROVIDER_VALUES);

export const CONNECTION_STATUS_VALUES = [
  'ACTIVE',
  'EXPIRED',
  'REVOKED',
] as const;
export type ConnectionStatus = (typeof CONNECTION_STATUS_VALUES)[number];
export const ConnectionStatus = enumObject(CONNECTION_STATUS_VALUES);

export const PAYMENT_METHOD_TYPE_VALUES = ['ACCOUNT', 'CARD'] as const;
export type PaymentMethodType = (typeof PAYMENT_METHOD_TYPE_VALUES)[number];
export const PaymentMethodType = enumObject(PAYMENT_METHOD_TYPE_VALUES);

export const PAYMENT_METHOD_STATUS_VALUES = [
  'ACTIVE',
  'EXPIRED',
  'REMOVED',
] as const;
export type PaymentMethodStatus = (typeof PAYMENT_METHOD_STATUS_VALUES)[number];
export const PaymentMethodStatus = enumObject(PAYMENT_METHOD_STATUS_VALUES);

export const ATTEMPT_PURPOSE_VALUES = [
  'SIGNUP',
  'WALLET_ADD',
  'RECONNECT',
] as const;
export type AttemptPurpose = (typeof ATTEMPT_PURPOSE_VALUES)[number];
export const AttemptPurpose = enumObject(ATTEMPT_PURPOSE_VALUES);

export const ATTEMPT_STATUS_VALUES = [
  'WAITING',
  'AUTHORIZED',
  'CONFIRMED',
  'FAILED',
  'EXPIRED',
] as const;
export type AttemptStatus = (typeof ATTEMPT_STATUS_VALUES)[number];
export const AttemptStatus = enumObject(ATTEMPT_STATUS_VALUES);

export const TX_KIND_VALUES = ['APPROVAL', 'CANCEL'] as const;
export type TxKind = (typeof TX_KIND_VALUES)[number];
export const TxKind = enumObject(TX_KIND_VALUES);

export const TX_SOURCE_VALUES = ['PROVIDER', 'MANUAL'] as const;
/** 지갑 거래의 출처. PROVIDER = 계좌·카드에서 가져옴, MANUAL = 직접 입력 */
export type TxSource = (typeof TX_SOURCE_VALUES)[number];
export const TxSource = enumObject(TX_SOURCE_VALUES);

export const RATE_TYPE_VALUES = ['MID'] as const;
export type RateType = (typeof RATE_TYPE_VALUES)[number];
export const RateType = enumObject(RATE_TYPE_VALUES);

export const SYNC_STATUS_VALUES = ['OK', 'FAILED', 'EXPIRED'] as const;
export type SyncStatus = (typeof SYNC_STATUS_VALUES)[number];
export const SyncStatus = enumObject(SYNC_STATUS_VALUES);

export const SYNC_TRIGGER_VALUES = [
  'SCHEDULED',
  'MANUAL',
  'TRIP_START',
  'JOIN',
  'RECONNECT',
  'METHOD_ADDED',
  'FINAL',
] as const;
export type SyncTrigger = (typeof SYNC_TRIGGER_VALUES)[number];
export const SyncTrigger = enumObject(SYNC_TRIGGER_VALUES);

export const TRIP_EVENT_TYPE_VALUES = [
  'LEADER_CHANGED',
  'FX_POLICY_CHANGED',
] as const;
export type TripEventType = (typeof TRIP_EVENT_TYPE_VALUES)[number];
export const TripEventType = enumObject(TRIP_EVENT_TYPE_VALUES);

export const CHANGE_ACTION_VALUES = [
  'CONFIRM_PERSONAL',
  'CONFIRM_SHARED',
  'SHARED_TO_PERSONAL',
  'PERSONAL_TO_SHARED',
  'PARTICIPANTS_CHANGED',
  'AUTO_PERSONAL_ON_END',
  'OUT_OF_PERIOD_ADDED',
  'REFUND_ATTACHED',
  'DUPLICATE_FLAGGED',
  'DUPLICATE_DISMISSED',
  'FX_RECALCULATED',
  'MANUAL_ADDED',
  'MANUAL_EDITED',
] as const;
export type ChangeAction = (typeof CHANGE_ACTION_VALUES)[number];
export const ChangeAction = enumObject(CHANGE_ACTION_VALUES);

export const ACCESS_ACTION_VALUES = [
  'VIEW_PAYMENT_METHODS',
  'VIEW_EXPENSE_DETAIL',
  'LIST_EXPENSES',
  'VIEW_CANDIDATES',
  'CONNECT',
  'DISCONNECT',
  'SYNC',
  'CLASSIFY_EXPENSE',
  'VIEW_SETTLEMENT',
  'DELETE_ACCOUNT',
  'LIST_WALLET_ENTRIES',
  'CREATE_EXPENSE',
  'EDIT_EXPENSE',
  'DELETE_EXPENSE',
] as const;
/** 금융 데이터 접근 로그(AccessLog.action) */
export type AccessAction = (typeof ACCESS_ACTION_VALUES)[number];
export const AccessAction = enumObject(ACCESS_ACTION_VALUES);

export const BUDGET_STATE_VALUES = ['NORMAL', 'CAUTION', 'OVER'] as const;
/** ratio < 0.8 · 0.8 ~ 1.0 · > 1.0 */
export type BudgetState = (typeof BUDGET_STATE_VALUES)[number];
export const BudgetState = enumObject(BUDGET_STATE_VALUES);

export const EDIT_BLOCK_REASON_VALUES = [
  'NOT_PAYER',
  /** 직접 입력한 결제: 작성자만 바꿀 수 있다 */
  'NOT_AUTHOR',
  'TRIP_ENDED',
  'TRIP_NOT_STARTED',
  'PAYER_LEFT',
] as const;
export type EditBlockReason = (typeof EDIT_BLOCK_REASON_VALUES)[number];
export const EditBlockReason = enumObject(EDIT_BLOCK_REASON_VALUES);
