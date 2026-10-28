import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

// https://vite.dev/config/
// 기본 빌드는 index.html만 묶는다. catalog.html(디자인 시스템 카탈로그)은 개발 서버나 --mode catalog로만 연다.
export default defineConfig(({ mode }) => ({
  plugins: [react(), tailwindcss()],
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
