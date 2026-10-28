import { defineConfig } from 'vitest/config';

export default defineConfig({
  resolve: { tsconfigPaths: true },
  test: {
    globals: true,
    root: './',
    include: ['**/*.e2e-spec.ts'],
    // 운영 모드(NODE_ENV=production)로 띄우는 테스트도 로그를 출력하지 않게 한다
    env: { LOG_LEVEL: 'silent' },
  },
});
