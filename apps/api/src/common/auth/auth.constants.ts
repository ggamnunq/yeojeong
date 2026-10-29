/** 세션 쿠키(httpOnly, SameSite=Lax, 운영 Secure). 값은 256bit 난수, DB에는 SHA-256만 저장한다 */
export const SESSION_COOKIE = 'yj_session';
/** 가입 대기 쿠키. SignupTicket id를 서명해 담는다(30분) */
export const SIGNUP_COOKIE = 'yj_signup';
/** 카카오 로그인 state 쿠키. state·returnTo를 서명해 담는다(10분) */
export const LOGIN_STATE_COOKIE = 'yj_oauth';
/** ValueSigner 용도 */
export const SIGNUP_PURPOSE = 'signup';
export const LOGIN_STATE_PURPOSE = 'kakao-login-state';

export const IS_PUBLIC_KEY = 'auth:isPublic';
export const REQUIRED_ROLE_KEY = 'auth:requiredRole';
export const REQUIRED_TRIP_STATUS_KEY = 'auth:requiredTripStatus';
export const REQUIRED_CONSENTS_KEY = 'auth:requiredConsents';
export const SKIP_CONSENT_CHECK_KEY = 'auth:skipConsentCheck';
/** 브라우저가 아닌 외부 서버가 부르는 콜백(카카오 연결 끊기 알림). CSRF 가드를 건너뛰고 라우트가 직접 인증한다 */
export const IS_EXTERNAL_WEBHOOK_KEY = 'auth:isExternalWebhook';
/**
 * 관리자 라우트(/api/admin/*, src/admin). 사용자 세션(yj_session)을 읽지도 쓰지도 않고 AuthGuard·ConsentGuard를 건너뛴다.
 * 인증은 관리자 세션 가드(AdminSessionGuard)가 따로 한다. src/admin의 @AdminOnly()·@AdminPublic()만 이 키를 단다
 */
export const IS_ADMIN_ROUTE_KEY = 'auth:isAdminRoute';
