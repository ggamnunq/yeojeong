import { ADMIN_LOGIN_LIMIT, ADMIN_SESSION_TTL } from '@yeojeong/shared';

/**
 * 관리자 세션 쿠키. __Host- 접두어 = Secure + Path=/ + Domain 없음을 브라우저가 강제한다(하위 도메인에서 덮어쓰기 불가).
 * HttpOnly · Secure · SameSite=Strict. 값은 256bit 난수(base64url 43자), DB에는 SHA-256만 둔다. 사용자 세션 쿠키(yj_session)와 별개다
 */
export const ADMIN_COOKIE = '__Host-yj_admin';
export const ADMIN_IDLE_MS = ADMIN_SESSION_TTL.IDLE_SECONDS * 1000;
export const ADMIN_ABSOLUTE_MS = ADMIN_SESSION_TTL.ABSOLUTE_SECONDS * 1000;
/** 마지막 사용 시각은 이 간격보다 오래됐을 때만 고친다(요청마다 쓰지 않게). 유휴 판정 오차는 이 값 이하 */
export const ADMIN_TOUCH_INTERVAL_MS = 60_000;
export const ADMIN_LOGIN_WINDOW_MS = ADMIN_LOGIN_LIMIT.WINDOW_SECONDS * 1000;
/** 로그인 시도 제한 전체 카운터 키 */
export const ADMIN_GLOBAL_THROTTLE_KEY = 'global';
