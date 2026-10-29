import { ACCESS_ACTION_VALUES } from '@yeojeong/shared';

/**
 * AccessLog.action 값(varchar(32)). 기능명세 2-3의 AccessAction(@yeojeong/shared)에
 * 8-1·8-2가 기록하라고 한 민감 변경·조회를 더했다. shared로 옮기는 것은 스키마 담당과 정한다(src/retention/README.md).
 */
export const AUDIT_ACTION_VALUES = [
  ...ACCESS_ACTION_VALUES,
  // ─ 운영자 DB 직접 접속(scripts/ops/db-connect.sh가 psql로 직접 쓴다, docs/ops/operator-access.md). 서버 코드는 쓰지 않는다 ─
  // user_id = md5('operator:' + 운영자 gcloud 이메일)로 만든 UUID(users 행 없음), resource_type = DATABASE,
  // request_id = 'opdb:<세션 ID>'(START·END를 잇는다), details = { operator, reason, host, at } (+ END는 durationSec·exitStatus)
  /** 운영자가 운영 DB에 직접 접속하기 시작했다 */
  'OPERATOR_DB_ACCESS_START',
  /** 운영자의 DB 직접 접속이 끝났다(정상·비정상 모두) */
  'OPERATOR_DB_ACCESS_END',
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
  /** 카드 불러오기 권한 목록 열람. details = 건수·회원 ID 목록 */
  'ADMIN_VIEW_CARD_IMPORT_GRANTS',
  /** 카드 불러오기 권한 부여. resourceId = 회원 ID, details = 결과(PENDING → GRANTED | 에러 코드)·메모 */
  'ADMIN_GRANT_CARD_IMPORT',
  /** 카드 불러오기 권한 회수. resourceId = 회원 ID, details = 결과(PENDING → REVOKED | 에러 코드)·원래 부여 시각 */
  'ADMIN_REVOKE_CARD_IMPORT',
] as const;
export type AuditAction = (typeof AUDIT_ACTION_VALUES)[number];

/** AccessLog.resourceType 값(varchar(32)). resourceId는 이 리소스의 UUID다 */
export const AUDIT_RESOURCE_TYPE_VALUES = [
  /** 운영 DB 자체(운영자 직접 접속 기록, resourceId 없음) */
  'DATABASE',
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
  /** 관리자 카드 불러오기 권한 목록(resourceId 없음. 부여·회수는 USER + 회원 ID) */
  'CARD_IMPORT_GRANT',
] as const;
export type AuditResourceType = (typeof AUDIT_RESOURCE_TYPE_VALUES)[number];
