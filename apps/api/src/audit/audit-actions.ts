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
  // ─ 관리자(src/admin). user_id = 관리자 행위자 ID(아이디에서 만든 UUID — users 행 없음), 개인정보취급자 접속 기록 ─
  /** 관리자 로그인 성공 */
  'ADMIN_LOGIN',
  /** 관리자 로그인 실패. details.reason = BAD_CREDENTIALS | RATE_LIMITED(입력한 아이디는 남기지 않는다) */
  'ADMIN_LOGIN_FAILED',
  'ADMIN_LOGOUT',
  /** 회원 목록 열람. details = 건수·검색 종류(NONE|NICKNAME|USER_ID)·정렬·페이지(검색어 원문은 남기지 않는다) */
  'ADMIN_VIEW_USERS',
  /** 회원 상세 열람. resourceId = 회원 ID */
  'ADMIN_VIEW_USER',
  /** 회원 탈퇴 처리. resourceId = 회원 ID, details = 사유·결과(PENDING → DELETED | 에러 코드) */
  'ADMIN_WITHDRAW_USER',
  /** CODEF 호출 현황 열람 */
  'ADMIN_VIEW_CODEF_USAGE',
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
  /** 관리자 로그인·로그아웃(resourceId 없음) */
  'ADMIN',
  /** 관리자 CODEF 호출 현황(resourceId 없음) */
  'CODEF_USAGE',
] as const;
export type AuditResourceType = (typeof AUDIT_RESOURCE_TYPE_VALUES)[number];
