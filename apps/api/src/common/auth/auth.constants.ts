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
