// 배포 직후 옛 번들을 연 화면이 지워진 chunk(React.lazy·동적 import)를 받지 못한 경우.
// 배포하면 옛 chunk 파일이 사라진다. Worker가 없는 /assets 파일에 404(또는 설정에 따라 index.html)를 돌려주므로
// 브라우저는 동적 import를 실패시킨다. React.lazy는 실패한 import를 기억해 「다시 시도」로는 풀리지 않는다 → 새로고침.
//
// 브라우저별 메시지(근거):
// - Chromium: "Failed to fetch dynamically imported module: <url>"
// - Firefox: "error loading dynamically imported module: <url>"
// - Safari(WebKit): "Importing a module script failed."
// - Safari: 모듈이 text/html 등으로 오면 "'text/html' is not a valid JavaScript MIME type." (WebKit ScriptModuleLoader)
// - Chromium: 모듈 스크립트가 HTML로 오면 "Failed to load module script: Expected a JavaScript(-or-Wasm) module script but the
//   server responded with a MIME type of "text/html"…"
// - Vite preload 도우미: "Unable to preload CSS for <url>"
// - webpack 계열(예전 번들·서드파티): "Loading chunk <id> failed", "Loading CSS chunk <id> failed"
// - Safari의 네트워크 실패는 TypeError "Load failed"(fetch와 같은 문구). API 호출은 apiFetch가 언제나 ApiError로 감싸므로
//   렌더링 경계까지 올라온 날것의 TypeError "Load failed"는 모듈·자산 로드 실패로 본다(정확히 같은 문장만).
// 메시지와 상관없이, Vite가 `vite:preloadError`로 알린 에러(동적 import 실패)도 chunk 실패로 본다(markChunkLoadError).
const CHUNK_ERROR = new RegExp(
  [
    'Failed to fetch dynamically imported module',
    'error loading dynamically imported module',
    'Importing a module script failed',
    'is not a valid JavaScript MIME type',
    'Expected a JavaScript(?:-or-Wasm)? module script but the server responded with a MIME type',
    'Unable to preload CSS',
    'Loading (?:CSS )?chunk [\\w-]+ failed',
  ].join('|'),
  'i',
)
const SAFARI_LOAD_FAILED = /^Load failed\.?$/

const marked = new WeakSet<object>()

/** vite:preloadError로 받은 에러를 chunk 실패로 표시한다(메시지가 위 목록에 없어도) */
export function markChunkLoadError(error: unknown) {
  if (typeof error === 'object' && error !== null) marked.add(error)
}

export function isChunkLoadError(error: unknown): boolean {
  if (!(error instanceof Error)) return false
  if (marked.has(error)) return true
  if (error.name === 'ChunkLoadError' || CHUNK_ERROR.test(error.message)) return true
  return error.name === 'TypeError' && SAFARI_LOAD_FAILED.test(error.message)
}
