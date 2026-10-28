import { fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { ApiError } from '../api/client'
import { isChunkLoadError } from './chunkError'
import { ErrorBoundary } from './ErrorBoundary'
import { ErrorFallback } from './ErrorFallback'

let shouldThrow: unknown = null

function Boom() {
  if (shouldThrow) throw shouldThrow
  return <p>정상 화면</p>
}

beforeEach(() => {
  // React가 잡은 렌더링 에러를 console.error로 남기는 것을 조용히 한다
  vi.spyOn(console, 'error').mockImplementation(() => {})
})

afterEach(() => {
  shouldThrow = null
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

  it('렌더링 에러면 「문제가 생겼어요」와 다시 시도, 누르면 onReset 후 다시 그린다', () => {
    shouldThrow = new TypeError('x is undefined')
    const onReset = vi.fn()
    render(
      <ErrorBoundary onReset={onReset}>
        <Boom />
      </ErrorBoundary>,
    )

    const alert = screen.getByRole('alert')
    expect(alert.textContent).toContain('문제가 생겼어요')
    expect(alert.textContent).toContain('잠시 후 다시 시도해 주세요')
    expect(alert.textContent).not.toContain('x is undefined')

    shouldThrow = null
    fireEvent.click(screen.getByRole('button', { name: '다시 시도' }))
    expect(onReset).toHaveBeenCalledTimes(1)
    expect(screen.getByText('정상 화면')).toBeTruthy()
  })

  it('ApiError면 서버 문구와 문의 번호(요청 ID 앞 8자)를 보여 준다', () => {
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
  })

  it('chunk 로드 실패(배포 직후 옛 번들)면 새로고침을 권한다', () => {
    shouldThrow = new TypeError(
      'Failed to fetch dynamically imported module: https://jinyeojeong.com/assets/Trip-3f9a.js',
    )
    render(
      <ErrorBoundary>
        <Boom />
      </ErrorBoundary>,
    )
    expect(screen.getByRole('alert').textContent).toContain('새 버전이 나왔어요')
    expect(screen.getByRole('button', { name: '새로고침' })).toBeTruthy()
    expect(screen.queryByRole('button', { name: '다시 시도' })).toBeNull()
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
    'Unable to preload CSS for /assets/a.css', // Vite preload
  ])('%s', (message) => {
    expect(isChunkLoadError(new TypeError(message))).toBe(true)
  })

  it('다른 에러는 아니다', () => {
    expect(isChunkLoadError(new TypeError('Failed to fetch'))).toBe(false)
    expect(isChunkLoadError('Failed to fetch dynamically imported module')).toBe(false)
  })
})
