import { describe, expect, it } from 'vitest'
import { apiFetch, ApiError, type TripDetail } from '../api'
import { db, EDGE_EXPENSE_IDS, expenseListItem, MEMBER, TRIP, USER, visibleExpenses } from './data'
import { mockError } from './utils'

describe('mockError', () => {
  it('서버 에러 형식으로 응답하고 shared 기본 status·문구를 쓴다', async () => {
    const res = mockError('NOT_FOUND')
    expect(res.status).toBe(404)
    const body = await res.json()
    expect(body).toMatchObject({ code: 'NOT_FOUND', message: '요청한 내용을 찾을 수 없어요' })
    expect(typeof body.requestId).toBe('string')
  })

  it('도메인 코드는 status·details를 직접 준다', async () => {
    const res = mockError('CONSENT_REQUIRED', 403, { missing: ['TOS'], required: [{ id: 'TOS', version: '0.1-draft' }] })
    expect(res.status).toBe(403)
    expect(await res.json()).toMatchObject({ code: 'CONSENT_REQUIRED', details: { missing: ['TOS'] } })
  })
})

describe('목 핸들러 계약', () => {
  it('features/*/mocks.ts는 http.* 대신 shared 타입을 고정한 api.*만 쓴다', () => {
    const sources = import.meta.glob<string>('../features/*/mocks.ts', { eager: true, query: '?raw', import: 'default' })
    expect(Object.keys(sources).length).toBeGreaterThan(0)
    for (const [file, source] of Object.entries(sources)) {
      expect(source, file).not.toMatch(/\bhttp\.(get|post|put|patch|delete|all|head|options)\(/)
    }
  })
})

describe('기본 목 핸들러', () => {
  it('GET /trips/:tripId → 샘플 여정', async () => {
    const trip = await apiFetch<TripDetail>(`/trips/${TRIP.osaka}`)
    expect(trip).toMatchObject({ groupName: '오사카 3박 4일', status: 'ONGOING', nights: 3, days: 4, inviteCode: 'K7M2QX' })
    expect(trip.me).toMatchObject({ membershipId: MEMBER.junyong, role: 'LEADER', pendingCount: 2 })
    expect(trip.members.map((m) => m.nickname)).toEqual(['준용', '민지', '태현', '수빈'])
  })

  it('멤버가 아니면 404 NOT_FOUND(존재를 숨긴다)', async () => {
    db.meUserId = USER.taehyeon
    await expect(apiFetch(`/trips/${TRIP.busan}`)).rejects.toMatchObject({ code: 'NOT_FOUND', status: 404 })
  })

  it('미로그인이면 401', async () => {
    db.session = 'ANONYMOUS'
    const error = await apiFetch('/me/trips').catch((e: unknown) => e)
    expect(error).toBeInstanceOf(ApiError)
    expect((error as ApiError).status).toBe(401)
  })
})

describe('샘플 결제', () => {
  it('엣지 시나리오를 빼면 공동 합계가 명세 수치(₩352,790)와 같다', () => {
    const shared = db.expenses.filter(
      (e) => e.status === 'SHARED' && !(EDGE_EXPENSE_IDS as readonly string[]).includes(e.id),
    )
    expect(shared.reduce((sum, e) => sum + e.krwAmount, 0)).toBe(352_790)
  })

  it('미확정·개인은 결제자에게만 보인다', () => {
    expect(visibleExpenses(TRIP.osaka, USER.junyong).some((e) => e.status === 'PENDING')).toBe(true)
    expect(visibleExpenses(TRIP.osaka, USER.minji).every((e) => e.status === 'SHARED')).toBe(true)
  })

  it('목록 항목: Day N, 부담 인원은 나 먼저 → 가입 순', () => {
    const mk = expenseListItem(db.expenses.find((e) => e.id === 'exp-mk')!, USER.minji)
    expect(mk.dayIndex).toBe(2)
    expect(mk.participants?.map((p) => p.nickname)).toEqual(['민지', '준용'])
    expect(mk.payer).toMatchObject({ nickname: '준용', isMe: false })
  })
})
