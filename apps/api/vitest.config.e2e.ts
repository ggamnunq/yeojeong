import { defineConfig } from 'vitest/config';
import { TEST_ENV } from './test/env.js';

export default defineConfig({
  resolve: { tsconfigPaths: true },
  test: {
    globals: true,
    root: './',
    include: ['**/*.e2e-spec.ts'],
    // 운영 모드(NODE_ENV=production)로 띄우는 테스트도 로그를 출력하지 않게 한다
    // 부팅에 필요한 env의 테스트 기본값(실제 값이 아님)
    env: { LOG_LEVEL: 'silent', ...TEST_ENV },
  },
});
