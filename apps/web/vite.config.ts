import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'
import { msw } from 'msw/vite'
import { readFileSync } from 'node:fs'
import { defineConfig } from 'vite'

/** 앱 버전(package.json version) — 마이페이지 "베타 v0.1.0" 표기(src/app/version.ts). 빌드 때 글자로 넣는다 */
export const APP_VERSION_DEFINE = {
  __APP_VERSION__: JSON.stringify((JSON.parse(readFileSync(new URL('./package.json', import.meta.url), 'utf8')) as { version: string }).version),
}

// https://vite.dev/config/
// 기본 빌드는 index.html만 묶는다. catalog.html(디자인 시스템 카탈로그)은 개발 서버나 --mode catalog로만 연다.
// MSW 워커 스크립트는 개발 서버에서만 내준다(VITE_MOCK_API=1, src/mocks). 빌드에는 플러그인을 넣지 않는다.
export default defineConfig(({ command, mode }) => ({
  plugins: [react(), tailwindcss(), command === 'serve' && msw({ mode: 'worker-only' })],
  define: APP_VERSION_DEFINE,
  server: {
    proxy: {
      '/api': 'http://localhost:3000',
    },
  },
  build: {
    // CSP가 font-src 'self'라서 폰트는 data: URI로 인라인하지 않는다
    assetsInlineLimit: (file: string) => (/\.(woff2?|ttf|otf)$/.test(file) ? false : undefined),
    ...(mode === 'catalog' && {
      outDir: 'dist-catalog',
      rolldownOptions: { input: 'catalog.html' },
    }),
  },
}))
