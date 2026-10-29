import { ACCESS_ACTION_VALUES } from '@yeojeong/shared';

/**
 * AccessLog.action 값(varchar(32)). 기능명세 2-3의 AccessAction(@yeojeong/shared)에
 * 8-1·8-2가 기록하라고 한 민감 변경·조회를 더했다. shared로 옮기는 것은 스키마 담당과 정한다(src/retention/README.md).
 */
export const AUDIT_ACTION_VALUES = [
  ...ACCESS_ACTION_VALUES,
  /** 활성 결제수단이 0개가 되어 연동 동의(FIN_LINK·FIN_PRIVACY)를 철회하고 개인·미확정 결제를 파기했다. details = 파기 건수 */
  'PURGE_FINANCIAL_DATA',
  /** 카카오 쪽 "연결 끊기" 알림을 받아 세션을 폐기했다(기능명세 7-1, 미결 Q-32 기본안) */
  'KAKAO_UNLINKED',
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
