import { defineConfig } from 'vitest/config';

export default defineConfig({
  // Resolves the path aliases declared in tsconfig.json, including the ones
  // added by `nest g library`. Requires Vite 8, which ships this option.
  resolve: { tsconfigPaths: true },
  test: {
    globals: true,
    root: './',
    include: ['**/*.spec.ts'],
    // 부팅에 필요한 env의 테스트 기본값(실제 값이 아님)
    env: { WEB_BASE_URL: 'http://localhost:5173' },
  },
});
