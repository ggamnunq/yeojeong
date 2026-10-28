// @vitest-environment node
import { ERRORS } from '@yeojeong/shared'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import worker from './index'

const env = { API_ORIGIN: 'https://api.example.run.app', ORIGIN_SECRET: 's'.repeat(32) }
const UUID_V4 = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/

let fetchMock: ReturnType<typeof vi.fn>

beforeEach(() => {
  fetchMock = vi.fn()
  vi.stubGlobal('fetch', fetchMock)
})

afterEach(() => {
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

describe('Worker /api 프록시', () => {
  it('API 서버에 닿지 못하면 공통 에러 형식의 502와 요청 ID를 돌려준다', async () => {
    const log = vi.spyOn(console, 'error').mockImplementation(() => {})
    fetchMock.mockRejectedValue(new Error('Network connection lost.'))

    const res = await worker.fetch(new Request('https://jinyeojeong.com/api/health'), env)

    expect(res.status).toBe(502)
    expect(res.headers.get('content-type')).toContain('application/json')
    expect(res.headers.get('cache-control')).toBe('no-store')
    const body = await res.json()
    expect(body).toEqual({
      code: 'UPSTREAM_UNAVAILABLE',
      message: ERRORS.UPSTREAM_UNAVAILABLE.message,
      requestId: expect.stringMatching(UUID_V4),
    })
    expect(res.headers.get('x-request-id')).toBe(body.requestId)
    // 로그에서 같은 ID로 찾을 수 있다
    expect(log.mock.calls[0][0]).toContain(body.requestId)
  })

  it('요청마다 다른 요청 ID를 만든다', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {})
    fetchMock.mockRejectedValue(new TypeError('fetch failed'))
    const ids = await Promise.all(
      [1, 2].map(async () => (await worker.fetch(new Request('https://jinyeojeong.com/api/health'), env)).headers.get('x-request-id')),
    )
    expect(ids[0]).not.toBe(ids[1])
  })

  it('정상 응답은 그대로 넘기고 프록시 헤더를 다시 채운다', async () => {
    fetchMock.mockResolvedValue(
      Response.json({ status: 'ok', db: 'up' }, { headers: { 'x-request-id': 'abc', server: 'Google Frontend' } }),
    )

    const res = await worker.fetch(
      new Request('https://jinyeojeong.com/api/health?x=1', {
        headers: { 'x-origin-auth': 'forged', 'cf-connecting-ip': '203.0.113.7', 'x-forwarded-for': '1.2.3.4' },
      }),
      env,
    )

    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ status: 'ok', db: 'up' })
    expect(res.headers.get('x-request-id')).toBe('abc')
    expect(res.headers.get('server')).toBeNull()

    const [url, init] = fetchMock.mock.calls[0] as [URL, RequestInit]
    expect(url.toString()).toBe('https://api.example.run.app/api/health?x=1')
    const headers = init.headers as Headers
    expect(headers.get('x-origin-auth')).toBe(env.ORIGIN_SECRET)
    expect(headers.get('x-client-ip')).toBe('203.0.113.7')
    expect(headers.get('x-forwarded-for')).toBeNull()
  })
})
