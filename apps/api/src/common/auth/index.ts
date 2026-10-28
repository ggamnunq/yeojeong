// 다른 모듈은 이 파일에서만 import한다. 사용법은 apps/api/README.md "인증과 권한".
export type {
  AuthContext,
  AuthSession,
  AuthUser,
  MembershipContext,
  TripContext,
} from './auth-context.js';
export { SESSION_COOKIE, SIGNUP_COOKIE } from './auth.constants.js';
export { AuthCoreModule } from './auth-core.module.js';
export {
  CONSENT_DOCUMENT_VERSIONS,
  currentConsentVersion,
  isConsentSatisfied,
  type ConsentDocumentVersion,
} from './consent-catalog.js';
export { ConsentChecker } from './consent-checker.js';
export {
  CurrentMembership,
  CurrentTrip,
  CurrentUser,
  Public,
  RequireConsents,
  RequireRole,
  RequireTripStatus,
  SkipConsentCheck,
} from './decorators.js';
export {
  AuthGuard,
  ConsentGuard,
  CsrfGuard,
  MembershipGuard,
  TripStatusGuard,
  consentRequired,
} from './guards.js';
export {
  MembershipLookup,
  type MembershipLookupResult,
  type MembershipQuery,
} from './membership-lookup.js';
export {
  SessionResolver,
  hashSessionToken,
  readCookie,
  type SessionState,
} from './session-resolver.js';
export { WebConfig } from './web-config.js';
