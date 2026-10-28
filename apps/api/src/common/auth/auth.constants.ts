/** 세션 쿠키(httpOnly, SameSite=Lax, 운영 Secure). 값은 256bit 난수, DB에는 SHA-256만 저장한다 */
export const SESSION_COOKIE = 'yj_session';
/** 가입 대기 쿠키. SignupTicket id를 서명해 담는다 */
export const SIGNUP_COOKIE = 'yj_signup';

export const IS_PUBLIC_KEY = 'auth:isPublic';
export const REQUIRED_ROLE_KEY = 'auth:requiredRole';
export const REQUIRED_TRIP_STATUS_KEY = 'auth:requiredTripStatus';
export const REQUIRED_CONSENTS_KEY = 'auth:requiredConsents';
export const SKIP_CONSENT_CHECK_KEY = 'auth:skipConsentCheck';
