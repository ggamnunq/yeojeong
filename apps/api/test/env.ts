/**
 * 테스트에서 부팅에 필요한 env 기본값(실제 값이 아님). vitest.config*.ts가 test.env로 넣는다.
 * WEB_BASE_URL은 test/auth-helpers.ts의 TEST_ORIGIN과 같다.
 */
export const TEST_ENV = {
  WEB_BASE_URL: 'http://localhost:5173',
  KAKAO_CLIENT_ID: 'test-kakao-client-id',
  KAKAO_CLIENT_SECRET: 'test-kakao-client-secret',
  // 운영 모드로 띄우는 테스트도 있어 https로 둔다
  KAKAO_REDIRECT_URI: 'https://yeojeong.test/api/auth/kakao/callback',
  SESSION_SECRET: 'test-session-secret-not-for-production-0000',
  // 32바이트 0을 base64로
  TOKEN_ENCRYPTION_KEY: 'AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA=',
  USER_REF_HMAC_KEY: 'test-user-ref-hmac-key-not-for-production-0',
  SUPPORT_EMAIL: 'support@jinyeojeong.com',
  INTERNAL_JOB_SECRET: 'test-internal-job-secret-not-production-000',
};
