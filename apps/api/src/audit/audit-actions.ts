import { ACCESS_ACTION_VALUES } from '@yeojeong/shared';

/**
 * AccessLog.action 값(varchar(32)). 기능명세 2-3의 AccessAction(@yeojeong/shared)에
 * 8-1·8-2가 기록하라고 한 민감 변경·조회를 더했다. shared로 옮기는 것은 스키마 담당과 정한다(src/retention/README.md).
 */
export const AUDIT_ACTION_VALUES = [
  ...ACCESS_ACTION_VALUES,
  /** 결제 분류·부담 인원 변경(FR-504~508) */
  'CLASSIFY_EXPENSE',
  /** 정산 요약·멤버별 내역 조회(FR-702~704) */
  'VIEW_SETTLEMENT',
  /** 서비스 내 탈퇴(FR-109) */
  'DELETE_ACCOUNT',
] as const;
export type AuditAction = (typeof AUDIT_ACTION_VALUES)[number];

/** AccessLog.resourceType 값(varchar(32)). resourceId는 이 리소스의 UUID다 */
export const AUDIT_RESOURCE_TYPE_VALUES = [
  'USER',
  'TRIP',
  'EXPENSE',
  'PAYMENT_METHOD',
  'PAYMENT_CONNECTION',
  'CONNECTION_ATTEMPT',
  'SETTLEMENT',
] as const;
export type AuditResourceType = (typeof AUDIT_RESOURCE_TYPE_VALUES)[number];
