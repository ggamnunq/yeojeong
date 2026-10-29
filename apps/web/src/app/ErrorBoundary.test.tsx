import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { ApiError } from '../api/client'
import { resetBuildCheck } from './buildInfo'
import { isChunkLoadError, markChunkLoadError } from './chunkError'
import { setClientErrorTransport, type ClientErrorReport } from './clientErrors'
import { ErrorBoundary } from './ErrorBoundary'
import { ErrorFallback } from './ErrorFallback'

let shouldThrow: unknown = null
let sent: ClientErrorReport[] = []

function Boom() {
  if (shouldThrow) throw shouldThrow
  return <p>정상 화면</p>
}

beforeEach(() => {
  // React가 잡은 렌더링 에러를 console.error로 남기는 것을 조용히 한다
  vi.spyOn(console, 'error').mockImplementation(() => {})
  sent = []
  setClientErrorTransport((body) => sent.push(JSON.parse(body) as ClientErrorReport))
  resetBuildCheck()
})

afterEach(() => {
  shouldThrow = null
  setClientErrorTransport(null)
  resetBuildCheck()
  vi.restoreAllMocks()
})

describe('ErrorBoundary', () => {
  it('에러가 없으면 자식을 그대로 그린다', () => {
    render(
      <ErrorBoundary>
        <Boom />
      </ErrorBoundary>,
    )
    expect(screen.getByText('정상 화면')).toBeTruthy()
  })

  it('렌더링 에러면 배포된 빌드를 확인한 뒤(같은 빌드) 「문제가 생겼어요」와 다시 시도, 누르면 onReset 후 다시 그린다', async () => {
    shouldThrow = new TypeError('x is undefined')
    const onReset = vi.fn()
    render(
      <ErrorBoundary onReset={onReset}>
        <Boom />
      </ErrorBoundary>,
    )

    // 확인하는 동안은 빈 화면
    expect(screen.getByRole('status', { name: '확인하는 중' })).toBeTruthy()
    const alert = await screen.findByRole('alert')
    expect(alert.textContent).toContain('문제가 생겼어요')
    expect(alert.textContent).toContain('잠시 후 다시 시도해 주세요')
    expect(alert.textContent).not.toContain('x is undefined')
    // 서버 로그로 한 번 보고한다(같은 빌드)
    await waitFor(() => expect(sent).toHaveLength(1))
    expect(sent[0]).toMatchObject({ source: 'boundary', name: 'TypeError', message: 'x is undefined', chunk: false, staleBuild: false })

    shouldThrow = null
    fireEvent.click(screen.getByRole('button', { name: '다시 시도' }))
    expect(onReset).toHaveBeenCalledTimes(1)
    expect(screen.getByText('정상 화면')).toBeTruthy()
  })

  it('chunk가 아닌 에러라도 배포된 빌드가 다르면(옛 번들) 「새 버전이 나왔어요」와 새로고침', async () => {
    localStorage.setItem('yj:mock:buildId', 'next-build')
    shouldThrow = new TypeError("Cannot read properties of undefined (reading 'members')")
    render(
      <ErrorBoundary>
        <Boom />
      </ErrorBoundary>,
    )
    const alert = await screen.findByRole('alert')
    expect(alert.textContent).toContain('새 버전이 나왔어요')
    expect(screen.getByRole('button', { name: '새로고침' })).toBeTruthy()
    expect(screen.queryByRole('button', { name: '다시 시도' })).toBeNull()
    await waitFor(() => expect(sent).toHaveLength(1))
    expect(sent[0]).toMatchObject({ chunk: false, staleBuild: true })
  })

  it('ApiError면 서버 문구와 문의 번호(요청 ID 앞 8자)를 보여 준다(보고하지 않는다 — 서버가 남긴다)', () => {
    shouldThrow = new ApiError({
      code: 'INTERNAL_ERROR',
      message: '일시적인 문제가 있으니 잠시 후 다시 시도해 주세요',
      status: 500,
      requestId: '05c8d730-1b2c-4d5e-8f90-123456789abc',
    })
    render(
      <ErrorBoundary>
        <Boom />
      </ErrorBoundary>,
    )
    const alert = screen.getByRole('alert')
    expect(alert.textContent).toContain('일시적인 문제가 있으니 잠시 후 다시 시도해 주세요')
    expect(alert.textContent).toContain('문의 번호 05c8d730')
    expect(sent).toHaveLength(0)
  })

  it('chunk 로드 실패(배포 직후 옛 번들)면 바로 새로고침을 권하고 보고한다', async () => {
    shouldThrow = new TypeError(
      'Failed to fetch dynamically imported module: https://jinyeojeong.com/assets/Trip-3f9a.js?v=1#code=K7M2QX',
    )
    render(
      <ErrorBoundary>
        <Boom />
      </ErrorBoundary>,
    )
    expect(screen.getByRole('alert').textContent).toContain('새 버전이 나왔어요')
    expect(screen.getByRole('button', { name: '새로고침' })).toBeTruthy()
    expect(screen.queryByRole('button', { name: '다시 시도' })).toBeNull()
    await waitFor(() => expect(sent).toHaveLength(1))
    expect(sent[0]).toMatchObject({
      chunk: true,
      message: 'Failed to fetch dynamically imported module: …/Trip-3f9a.js',
    })
  })

  it('같은 오류는 세션에서 한 번만 보고한다', async () => {
    shouldThrow = new TypeError('x is undefined')
    const first = render(
      <ErrorBoundary>
        <Boom />
      </ErrorBoundary>,
    )
    await screen.findByRole('alert')
    first.unmount()
    render(
      <ErrorBoundary>
        <Boom />
      </ErrorBoundary>,
    )
    await screen.findByRole('alert')
    await waitFor(() => expect(sent).toHaveLength(1))
  })

  it('fallback으로 대체 화면을 바꿀 수 있다', () => {
    shouldThrow = new Error('boom')
    render(
      <ErrorBoundary fallback={({ reset }) => <button onClick={reset}>처음으로</button>}>
        <Boom />
      </ErrorBoundary>,
    )
    expect(screen.getByRole('button', { name: '처음으로' })).toBeTruthy()
  })
})

describe('ErrorFallback', () => {
  it('새로고침 버튼은 onReload를 부른다', () => {
    const onReload = vi.fn()
    render(<ErrorFallback error={new Error('Importing a module script failed.')} onRetry={() => {}} onReload={onReload} />)
    fireEvent.click(screen.getByRole('button', { name: '새로고침' }))
    expect(onReload).toHaveBeenCalledTimes(1)
  })
})

describe('isChunkLoadError', () => {
  it.each([
    'Failed to fetch dynamically imported module: /assets/a.js', // Chromium
    'error loading dynamically imported module: /assets/a.js', // Firefox
    'Importing a module script failed.', // Safari
    "'text/html' is not a valid JavaScript MIME type.", // Safari: 지워진 chunk 자리에 HTML이 온 경우
    'Failed to load module script: Expected a JavaScript-or-Wasm module script but the server responded with a MIME type of "text/html". Strict MIME type checking is enforced for module scripts per HTML spec.', // Chromium
    'Failed to load module script: Expected a JavaScript module script but the server responded with a MIME type of "text/html".', // 예전 Chromium
    'Unable to preload CSS for /assets/a.css', // Vite preload
    'Loading chunk 123 failed.', // webpack 계열
    'Loading CSS chunk vendors-main failed.',
    'Load failed', // Safari 네트워크 실패(TypeError만)
  ])('%s', (message) => {
    expect(isChunkLoadError(new TypeError(message))).toBe(true)
  })

  it('다른 에러는 아니다', () => {
    expect(isChunkLoadError(new TypeError('Failed to fetch'))).toBe(false)
    expect(isChunkLoadError(new TypeError('NetworkError when attempting to fetch resource.'))).toBe(false)
    expect(isChunkLoadError('Failed to fetch dynamically imported module')).toBe(false)
    // "Load failed"는 TypeError의 정확한 문장만
    expect(isChunkLoadError(new Error('Load failed'))).toBe(false)
    expect(isChunkLoadError(new TypeError('Image load failed for avatar'))).toBe(false)
  })

  it('vite:preloadError로 표시한 에러는 메시지와 상관없이 chunk 실패다', () => {
    const error = new TypeError('Something odd happened')
    expect(isChunkLoadError(error)).toBe(false)
    markChunkLoadError(error)
    expect(isChunkLoadError(error)).toBe(true)
  })
})
