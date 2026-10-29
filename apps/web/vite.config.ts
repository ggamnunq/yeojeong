import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'
import { msw } from 'msw/vite'
import { execFileSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { defineConfig, type Plugin } from 'vite'

/**
 * 빌드 ID: BUILD_ID 환경변수 → GitHub Actions의 GITHUB_SHA 앞 12자 → 로컬 git HEAD 앞 12자(+ -dirty) → 'local'.
 * 개발 서버는 'dev'. 형식은 [A-Za-z0-9_.-] 64자 이하(src/app/buildInfo.ts가 같은 규칙으로 읽는다)
 */
function resolveBuildId(command: 'build' | 'serve'): string {
  if (command === 'serve') return 'dev'
  const clean = (value: string | undefined) => value?.trim().replace(/[^\w.-]/g, '').slice(0, 64) || undefined
  const fromEnv = clean(process.env.BUILD_ID) ?? clean(process.env.GITHUB_SHA?.slice(0, 12))
  if (fromEnv) return fromEnv
  try {
    const sha = execFileSync('git', ['rev-parse', '--short=12', 'HEAD'], { encoding: 'utf8' }).trim()
    const dirty = execFileSync('git', ['status', '--porcelain'], { encoding: 'utf8' }).trim() !== ''
    return clean(`${sha}${dirty ? '-dirty' : ''}`) ?? 'local'
  } catch {
    return 'local'
  }
}

/**
 * 빌드 ID를 번들(import.meta.env.VITE_BUILD_ID)과 정적 파일 /version.json({ buildId })에 같이 넣는다.
 * 오래 열어 둔 탭이 배포된 빌드와 다른지 확인하는 데 쓴다(src/app/buildInfo.ts · staleBundle.ts, public/_headers가 no-store).
 * 개발 서버는 /version.json을 직접 내준다(목 E2E는 MSW로 값을 바꾼다).
 */
function buildInfo(buildId: string): Plugin {
  const body = `${JSON.stringify({ buildId })}\n`
  return {
    name: 'yeojeong:build-info',
    config: () => ({ define: { 'import.meta.env.VITE_BUILD_ID': JSON.stringify(buildId) } }),
    configureServer(server) {
      server.middlewares.use('/version.json', (_req, res) => {
        res.setHeader('content-type', 'application/json')
        res.setHeader('cache-control', 'no-store')
        res.end(body)
      })
    },
    generateBundle() {
      this.emitFile({ type: 'asset', fileName: 'version.json', source: body })
    },
  }
}

/** 앱 버전(package.json version) — 마이페이지 "베타 v0.1.0" 표기(src/app/version.ts). 빌드 때 글자로 넣는다 */
export const APP_VERSION_DEFINE = {
  __APP_VERSION__: JSON.stringify((JSON.parse(readFileSync(new URL('./package.json', import.meta.url), 'utf8')) as { version: string }).version),
}

// https://vite.dev/config/
// 기본 빌드는 index.html만 묶는다. catalog.html(디자인 시스템 카탈로그)은 개발 서버나 --mode catalog로만 연다.
// MSW 워커 스크립트는 개발 서버에서만 내준다(VITE_MOCK_API=1, src/mocks). 빌드에는 플러그인을 넣지 않는다.
export default defineConfig(({ command, mode }) => ({
  plugins: [
    react(),
    tailwindcss(),
    buildInfo(resolveBuildId(command)),
    command === 'serve' && msw({ mode: 'worker-only' }),
  ],
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
