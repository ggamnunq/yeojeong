import react from '@vitejs/plugin-react'
import { defineConfig } from 'vitest/config'
import { APP_VERSION_DEFINE } from './vite.config.ts'

export default defineConfig({
  plugins: [react()],
  define: APP_VERSION_DEFINE,
  test: {
    environment: 'jsdom',
    include: ['src/**/*.test.{ts,tsx}', 'scripts/**/*.test.mjs', 'worker/**/*.test.ts'],
    setupFiles: ['src/test/setup.ts'],
    // 변환 결과를 파일로 캐시하면 import.meta.glob(라우트·목 자동 수집)이 새로 생긴 features/*/ 파일을 못 본다
    fsModuleCache: false,
  },
})
