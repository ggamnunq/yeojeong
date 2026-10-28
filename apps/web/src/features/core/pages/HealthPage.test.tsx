import { act, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { ApiProvider, createQueryClient } from '../../../api'
import { toastStore } from '../../../notifications/store'
import { ToastHost } from '../../../notifications/ToastHost'
import HealthPage from './HealthPage'

const statusOf = (label: string) => screen.getByText(label).nextElementSibling?.textContent

function renderApp() {
  return render(
    <ApiProvider client={createQueryClient()}>
      <HealthPage />
      <ToastHost aboveNav={false} />
    </ApiProvider>,
  )
}

let fetchMock: ReturnType<typeof vi.fn>

beforeEach(() => {
  fetchMock = vi.fn()
  vi.stubGlobal('fetch', fetchMock)
  toastStore.clear()
})

afterEach(() => {
  vi.useRealTimers()
  vi.unstubAllGlobals()
  toastStore.clear()
})

describe('헬스 화면(/__health)', () => {
  it('/api/health 결과로 서버·DB 상태를 보여 준다', async () => {
    fetchMock.mockResolvedValue(Response.json({ status: 'ok', db: 'down' }))
    renderApp()
    expect(statusOf('서버')).toBe('checking')

    await screen.findByText('up')
    expect(statusOf('서버')).toBe('up')
    expect(statusOf('DB')).toBe('down')
    expect(fetchMock.mock.calls[0][0]).toBe('/api/health')
  })

  it('서버에 닿지 못하면 두 번 더 시도한 뒤 down과 「다시 시도」 토스트', async () => {
    vi.useFakeTimers()
    fetchMock.mockImplementation(async () => new Response('<h1>502 Bad Gateway</h1>', { status: 502 }))
    renderApp()

    await act(() => vi.advanceTimersByTimeAsync(3010))
    expect(fetchMock).toHaveBeenCalledTimes(3)
    expect(statusOf('서버')).toBe('down')
    expect(screen.getByRole('alert').textContent).toContain('서버에 연결하지 못했어요')
    expect(screen.getByRole('button', { name: '다시 시도' })).toBeTruthy()
  })
})
