import { http, HttpResponse } from 'msw'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { server } from '../mocks/server'
import { resetBuildCheck } from './buildInfo'
import { isChunkLoadError } from './chunkError'
import { BACKGROUND_THRESHOLD_MS, installStaleBundleWatch, NO_AUTO_RELOAD_ATTR, type RouterLike } from './staleBundle'

type State = RouterLike['state']

function fakeRouter(pathname = '/trips') {
  const listeners = new Set<(state: State) => void>()
  const router: RouterLike = {
    state: { location: { pathname, state: null }, navigation: { state: 'idle' } },
    subscribe: (fn) => {
      listeners.add(fn)
      return () => listeners.delete(fn)
    },
  }
  const go = (next: string, state: unknown = null) => {
    router.state = { location: { pathname: next, state }, navigation: { state: 'idle' } }
    for (const fn of listeners) fn(router.state)
  }
  return { router, go }
}

let visibility: DocumentVisibilityState = 'visible'
let clock = 0
let dispose: (() => void) | null = null

function setVisibility(next: DocumentVisibilityState) {
  visibility = next
  document.dispatchEvent(new Event('visibilitychange'))
}

/** 백그라운드에 ms만큼 있다 돌아온다 */
function background(ms: number) {
  setVisibility('hidden')
  clock += ms
  setVisibility('visible')
}

function setup(pathname = '/trips') {
  const { router, go } = fakeRouter(pathname)
  const reload = vi.fn()
  dispose = installStaleBundleWatch({ router, now: () => clock, reload, afterPaint: (fn) => fn() })
  return { go, reload }
}

const flush = () => new Promise((resolve) => setTimeout(resolve, 0))

beforeEach(() => {
  clock = 1_000_000
  visibility = 'visible'
  vi.spyOn(document, 'visibilityState', 'get').mockImplementation(() => visibility)
  server.use(http.get('/version.json', () => HttpResponse.json({ buildId: 'next-build' })))
  resetBuildCheck()
})

afterEach(() => {
  dispose?.()
  dispose = null
  document.body.innerHTML = ''
  resetBuildCheck()
  vi.restoreAllMocks()
})

describe('installStaleBundleWatch', () => {
  it('30분 넘게 백그라운드에 있다 돌아와 새 빌드가 있으면, 다음 라우트 이동 때 한 번 새로고침한다', async () => {
    const { go, reload } = setup()
    background(BACKGROUND_THRESHOLD_MS + 1)
    await flush()

    // 이동 전에는 새로고침하지 않는다
    expect(reload).not.toHaveBeenCalled()
    go('/trips/new')
    expect(reload).toHaveBeenCalledTimes(1)
    expect(sessionStorage.getItem('yj:stale-reload:for')).toBe('next-build')
  })

  it('30분보다 짧게 비웠으면 확인하지 않는다', async () => {
    let calls = 0
    server.use(
      http.get('/version.json', () => {
        calls += 1
        return HttpResponse.json({ buildId: 'next-build' })
      }),
    )
    const { go, reload } = setup()
    background(BACKGROUND_THRESHOLD_MS - 1)
    await flush()
    go('/trips/new')
    expect(calls).toBe(0)
    expect(reload).not.toHaveBeenCalled()
  })

  it('배포된 빌드가 같거나 확인하지 못하면 새로고침하지 않는다', async () => {
    server.use(http.get('/version.json', () => HttpResponse.json({ buildId: 'dev' })))
    const { go, reload } = setup()
    background(BACKGROUND_THRESHOLD_MS + 1)
    await flush()
    go('/trips/new')

    server.use(http.get('/version.json', () => new HttpResponse(null, { status: 404 })))
    resetBuildCheck()
    background(BACKGROUND_THRESHOLD_MS + 1)
    await flush()
    go('/join')
    expect(reload).not.toHaveBeenCalled()
  })

  it('입력한 값이 남은 칸이 화면에 있으면 이번 이동은 넘기고, 칸이 사라진 다음 이동 때 새로고침한다', async () => {
    const { go, reload } = setup('/trips/new')
    const input = document.createElement('input')
    document.body.append(input)
    input.value = '도쿄 여행'
    input.dispatchEvent(new Event('input', { bubbles: true }))

    background(BACKGROUND_THRESHOLD_MS + 1)
    await flush()
    go('/trips/new/step')
    expect(reload).not.toHaveBeenCalled()

    input.remove()
    go('/trips')
    expect(reload).toHaveBeenCalledTimes(1)
  })

  it('입력했다가 다 지운 칸은 입력 중으로 보지 않는다', async () => {
    const { go, reload } = setup()
    const textarea = document.createElement('textarea')
    document.body.append(textarea)
    textarea.value = 'x'
    textarea.dispatchEvent(new Event('input', { bubbles: true }))
    textarea.value = ''
    background(BACKGROUND_THRESHOLD_MS + 1)
    await flush()
    go('/trips/new')
    expect(reload).toHaveBeenCalledTimes(1)
  })

  it('이동에 화면 상태(location.state)가 실렸거나 data-no-auto-reload가 있으면 넘긴다', async () => {
    const { go, reload } = setup()
    background(BACKGROUND_THRESHOLD_MS + 1)
    await flush()
    go('/wallet/import/issuer', { cardImportFlow: true })
    expect(reload).not.toHaveBeenCalled()

    const flow = document.createElement('div')
    flow.setAttribute(NO_AUTO_RELOAD_ATTR, '')
    document.body.append(flow)
    go('/wallet/import/0306')
    expect(reload).not.toHaveBeenCalled()

    flow.remove()
    go('/wallet')
    expect(reload).toHaveBeenCalledTimes(1)
  })

  it('같은 빌드로는 한 번만 새로고침한다(새로고침 뒤에도 옛 값이면 반복하지 않는다)', async () => {
    sessionStorage.setItem('yj:stale-reload:for', 'next-build')
    const { go, reload } = setup()
    background(BACKGROUND_THRESHOLD_MS + 1)
    await flush()
    go('/trips/new')
    expect(reload).not.toHaveBeenCalled()
  })

  it('bfcache에서 돌아온 페이지(pageshow persisted)도 확인한다', async () => {
    const { go, reload } = setup()
    window.dispatchEvent(new Event('pagehide'))
    clock += BACKGROUND_THRESHOLD_MS + 1
    const show = new Event('pageshow') as PageTransitionEvent
    Object.defineProperty(show, 'persisted', { value: true })
    window.dispatchEvent(show)
    await flush()
    go('/trips/new')
    expect(reload).toHaveBeenCalledTimes(1)
  })

  it('같은 경로 안의 변화(쿼리만 바뀜)는 이동으로 보지 않는다', async () => {
    const { go, reload } = setup()
    background(BACKGROUND_THRESHOLD_MS + 1)
    await flush()
    go('/trips')
    expect(reload).not.toHaveBeenCalled()
  })

  it('vite:preloadError의 에러를 chunk 실패로 표시한다(기본 동작은 막지 않는다)', () => {
    setup()
    const error = new TypeError('unexpected message')
    const event = new Event('vite:preloadError', { cancelable: true }) as Event & { payload?: unknown }
    event.payload = error
    window.dispatchEvent(event)
    expect(isChunkLoadError(error)).toBe(true)
    expect(event.defaultPrevented).toBe(false)
  })
})
