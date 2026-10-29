import { checkBuild } from './buildInfo'
import { markChunkLoadError } from './chunkError'

// 오래 열어 둔 탭(옛 번들)을 안전한 때에 새 번들로 바꾼다.
// 1) 탭이 백그라운드에 BACKGROUND_THRESHOLD_MS(30분) 넘게 있다 돌아오면(visibilitychange · bfcache pageshow) /version.json을 본다.
// 2) 배포된 빌드가 다르면 「다음 라우트 이동」 때 전체 새로고침한다. 이동이 끝난 화면을 다시 불러오는 것이라 주소는 그대로다.
// 3) 단, 지금 화면에 사용자가 입력한 칸이 남아 있거나(이동 뒤에도 연결된 입력 요소), 이동에 화면 상태(location.state —
//    카드 불러오기 단계 등)가 실려 있거나, data-no-auto-reload 표시가 있으면 이번 이동은 넘기고 다음 이동을 기다린다.
// 4) 같은 빌드로는 한 번만 새로고침한다(배포 전파가 늦어 새로고침 뒤에도 옛 값이면 무한 반복하지 않게).
// vite:preloadError(동적 import·CSS preload 실패)는 그 에러를 chunk 실패로 표시하고, 기본 동작(에러를 던짐)은 막지 않는다
// → 에러 경계가 「새 버전이 나왔어요 · 새로고침」을 보여 준다.

export const BACKGROUND_THRESHOLD_MS = 30 * 60_000
const RELOADED_FOR_KEY = 'yj:stale-reload:for'
export const NO_AUTO_RELOAD_ATTR = 'data-no-auto-reload'

/** 라우터에서 필요한 것만(createBrowserRouter 결과) */
export type RouterLike = {
  state: { location: { pathname: string; state: unknown }; navigation: { state: string } }
  subscribe: (fn: (state: RouterLike['state']) => void) => () => void
}

type Options = {
  router: RouterLike
  win?: Window
  now?: () => number
  /** 전체 새로고침(테스트에서 바꾼다) */
  reload?: () => void
  /** 다음 화면이 그려진 뒤 부른다(테스트에서 바꾼다) */
  afterPaint?: (fn: () => void) => void
}

const EDITABLE = 'input, textarea, select, [contenteditable=""], [contenteditable="true"]'
const NON_TEXT_INPUT = new Set(['button', 'submit', 'reset', 'hidden', 'image'])

function isEditable(target: EventTarget | null): target is Element {
  if (!(target instanceof Element) || !target.matches(EDITABLE)) return false
  return !(target instanceof HTMLInputElement && NON_TEXT_INPUT.has(target.type))
}

/** 입력한 값이 남아 있는지. 다 지운 글 칸은 입력 중으로 보지 않는다. 선택형(체크·라디오·select)은 건드렸으면 남은 것으로 본다 */
function hasUserValue(element: Element): boolean {
  if (element instanceof HTMLTextAreaElement) return element.value.trim() !== ''
  if (element instanceof HTMLInputElement) {
    return element.type === 'checkbox' || element.type === 'radio' || element.value.trim() !== ''
  }
  if (element instanceof HTMLSelectElement) return true
  return (element.textContent ?? '').trim() !== ''
}

function readReloadedFor(win: Window): string | null {
  try {
    return win.sessionStorage.getItem(RELOADED_FOR_KEY)
  } catch {
    return null
  }
}

function writeReloadedFor(win: Window, buildId: string) {
  try {
    win.sessionStorage.setItem(RELOADED_FOR_KEY, buildId)
  } catch {
    // 저장소가 없으면 반복 방지 없이 한 번 새로고침한다
  }
}

/** 오래된 번들 감시를 켠다. 끄는 함수를 돌려준다 */
export function installStaleBundleWatch({
  router,
  win = window,
  now = Date.now,
  reload = () => win.location.reload(),
  afterPaint = (fn) => win.requestAnimationFrame(() => win.setTimeout(fn, 0)),
}: Options): () => void {
  const doc = win.document
  let hiddenAt: number | null = doc.visibilityState === 'hidden' ? now() : null
  /** 새로고침할 최신 빌드 ID(다르다는 것을 확인했을 때만) */
  let pendingBuildId: string | null = null
  /** 사용자가 입력한 요소. 이동 뒤에도 화면에 남아 있으면 입력 중인 폼으로 본다 */
  const touched = new Set<Element>()
  let lastPathname = router.state.location.pathname

  const check = () => {
    void checkBuild(now()).then(({ freshness, latestBuildId }) => {
      if (freshness !== 'stale' || !latestBuildId) return
      if (readReloadedFor(win) === latestBuildId) return
      pendingBuildId = latestBuildId
    })
  }

  const onReturn = () => {
    const away = hiddenAt === null ? 0 : now() - hiddenAt
    hiddenAt = null
    if (away >= BACKGROUND_THRESHOLD_MS) check()
  }

  const onVisibility = () => {
    if (doc.visibilityState === 'hidden') hiddenAt = now()
    else onReturn()
  }

  // bfcache에서 돌아온 페이지는 visibilitychange 없이 보일 수 있다. 숨겨진 시각은 pagehide로 잡는다
  const onPageHide = () => {
    hiddenAt ??= now()
  }
  const onPageShow = (event: PageTransitionEvent) => {
    if (event.persisted) onReturn()
  }

  const onInput = (event: Event) => {
    if (isEditable(event.target)) touched.add(event.target)
  }

  const onPreloadError = (event: Event) => {
    markChunkLoadError((event as Event & { payload?: unknown }).payload)
  }

  const safeToReload = (location: RouterLike['state']['location']): boolean => {
    for (const element of touched) if (!element.isConnected || !hasUserValue(element)) touched.delete(element)
    if (touched.size > 0) return false
    if (location.state != null) return false
    return doc.querySelector(`[${NO_AUTO_RELOAD_ATTR}]`) === null
  }

  const unsubscribe = router.subscribe((state) => {
    const { location, navigation } = state
    if (navigation.state !== 'idle' || location.pathname === lastPathname) return
    lastPathname = location.pathname
    const buildId = pendingBuildId
    if (!buildId) return
    afterPaint(() => {
      // 그사이 또 이동했으면 그 이동이 다시 판단한다
      if (pendingBuildId !== buildId || router.state.location.pathname !== location.pathname) return
      if (!safeToReload(router.state.location)) return
      pendingBuildId = null
      writeReloadedFor(win, buildId)
      reload()
    })
  })

  doc.addEventListener('visibilitychange', onVisibility)
  win.addEventListener('pagehide', onPageHide)
  win.addEventListener('pageshow', onPageShow)
  doc.addEventListener('input', onInput, true)
  doc.addEventListener('change', onInput, true)
  win.addEventListener('vite:preloadError', onPreloadError)

  return () => {
    unsubscribe()
    doc.removeEventListener('visibilitychange', onVisibility)
    win.removeEventListener('pagehide', onPageHide)
    win.removeEventListener('pageshow', onPageShow)
    doc.removeEventListener('input', onInput, true)
    doc.removeEventListener('change', onInput, true)
    win.removeEventListener('vite:preloadError', onPreloadError)
  }
}
