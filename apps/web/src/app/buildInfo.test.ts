import { http, HttpResponse } from 'msw'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { server } from '../mocks/server'
import { BUILD_ID, checkBuild, compareBuild, fetchLatestBuildId, parseVersionFile, resetBuildCheck } from './buildInfo'

afterEach(() => resetBuildCheck())

describe('compareBuild', () => {
  it('같으면 current, 다르면 stale, 모르면 unknown', () => {
    expect(compareBuild('abc123def456', 'abc123def456')).toBe('current')
    expect(compareBuild('abc123def456', '0123456789ab')).toBe('stale')
    expect(compareBuild('abc123def456', null)).toBe('unknown')
  })
})

describe('parseVersionFile', () => {
  it('빌드 ID 형식([A-Za-z0-9_.-] 64자 이하)만 받는다', () => {
    expect(parseVersionFile({ buildId: 'ccd404d9a1b2' })).toBe('ccd404d9a1b2')
    expect(parseVersionFile({ buildId: 'ccd404d9a1b2-dirty' })).toBe('ccd404d9a1b2-dirty')
    expect(parseVersionFile({ buildId: '' })).toBeNull()
    expect(parseVersionFile({ buildId: '<script>' })).toBeNull()
    expect(parseVersionFile({ buildId: 'x'.repeat(65) })).toBeNull()
    expect(parseVersionFile({ buildId: 1 })).toBeNull()
    expect(parseVersionFile('ccd404d')).toBeNull()
    expect(parseVersionFile(null)).toBeNull()
  })
})

describe('fetchLatestBuildId', () => {
  it('/version.json을 캐시 없이(쿠키도 없이) 읽는다', async () => {
    server.use(http.get('/version.json', () => HttpResponse.json({ buildId: 'next-build' })))
    const spy = vi.spyOn(globalThis, 'fetch')
    expect(await fetchLatestBuildId()).toBe('next-build')
    expect(spy).toHaveBeenCalledWith('/version.json', expect.objectContaining({ cache: 'no-store', credentials: 'omit' }))
    spy.mockRestore()
  })

  it('404·HTML(SPA 폴백)·네트워크 실패·시간 초과는 null', async () => {
    server.use(http.get('/version.json', () => new HttpResponse(null, { status: 404 }), { once: true }))
    expect(await fetchLatestBuildId()).toBeNull()

    server.use(http.get('/version.json', () => HttpResponse.html('<!doctype html>'), { once: true }))
    expect(await fetchLatestBuildId()).toBeNull()

    server.use(http.get('/version.json', () => HttpResponse.error(), { once: true }))
    expect(await fetchLatestBuildId()).toBeNull()

    server.use(
      http.get('/version.json', async () => {
        await new Promise((resolve) => setTimeout(resolve, 200))
        return HttpResponse.json({ buildId: 'late' })
      }),
    )
    expect(await fetchLatestBuildId(20)).toBeNull()
  })
})

describe('checkBuild', () => {
  it('이 번들의 빌드 ID와 비교하고, 30초 안에는 다시 묻지 않는다', async () => {
    let calls = 0
    server.use(
      http.get('/version.json', () => {
        calls += 1
        return HttpResponse.json({ buildId: 'next-build' })
      }),
    )
    expect(BUILD_ID).toBe('dev')
    expect(await checkBuild(1_000)).toEqual({ freshness: 'stale', latestBuildId: 'next-build' })
    await Promise.all([checkBuild(2_000), checkBuild(20_000)])
    expect(calls).toBe(1)
    await checkBuild(40_000)
    expect(calls).toBe(2)
  })
})
