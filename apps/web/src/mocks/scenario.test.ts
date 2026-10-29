import { describe, expect, it } from 'vitest'
import { apiFetch, type MyTripsResponse, type TripDetail } from '../api'
import { db, TRIP, USER } from './data'
import { applyPerspective, edgeHandler, FUKUOKA, readScenario, scenarioFromUrl, writeScenario } from './scenario'
import { server } from './server'

describe('목 시나리오(QA)', () => {
  it('주소 쿼리를 저장소로 옮긴다(mockAs · mockEdge · mockEdgePath · mockPanel)', () => {
    scenarioFromUrl('?mockAs=member&mockEdge=429&mockEdgePath=/settlement&mockPanel=1')
    expect(readScenario()).toEqual({ as: 'member', edge: '429', edgePath: '/settlement', panel: true })
    scenarioFromUrl('?mockEdge=off&mockPanel=0')
    expect(readScenario()).toMatchObject({ as: 'member', edge: null, edgePath: null, panel: false })
    // 모르는 값은 무시
    scenarioFromUrl('?mockAs=admin')
    expect(readScenario().as).toBe('member')
  })

  it('시점: 그룹장(준용) · 멤버(민지, 오사카 그룹장 아님) · 다른 사용자(소속 여정 없음)', async () => {
    applyPerspective('member')
    expect(db.meUserId).toBe(USER.minji)
    const osaka = await apiFetch<TripDetail>(`/trips/${TRIP.osaka}`)
    expect(osaka.me.role).toBe('MEMBER')
    expect(osaka.permissions.canEnd).toBe(false)

    applyPerspective('other')
    expect((await apiFetch<MyTripsResponse>('/me/trips')).items).toEqual([])

    applyPerspective('leader')
    expect((await apiFetch<TripDetail>(`/trips/${TRIP.osaka}`)).me.role).toBe('LEADER')
  })

  it('5명 넘는 진행 중 여정 픽스처(6명, 긴 장소)', async () => {
    applyPerspective('leader')
    const trip = await apiFetch<TripDetail>(`/trips/${FUKUOKA}`)
    expect(trip.status).toBe('ONGOING')
    expect(trip.members).toHaveLength(6)
    expect(trip.placeLabel.length).toBeGreaterThan(20)
  })

  it('엣지 응답은 다음 요청 한 번(경로 필터)만 바꾸고 스위치를 끈다', async () => {
    server.use(edgeHandler)
    writeScenario({ edge: '404', edgePath: `/trips/${TRIP.osaka}` })
    // 경로가 다르면 그대로
    await expect(apiFetch('/me/trips')).resolves.toBeTruthy()
    await expect(apiFetch(`/trips/${TRIP.osaka}`)).rejects.toMatchObject({ status: 404, code: 'NOT_FOUND' })
    expect(readScenario().edge).toBeNull()
    await expect(apiFetch(`/trips/${TRIP.osaka}`)).resolves.toBeTruthy()

    writeScenario({ edge: '409' })
    await expect(apiFetch(`/trips/${TRIP.osaka}`, { method: 'PATCH', body: { version: 3 } })).rejects.toMatchObject({
      status: 409,
      code: 'VERSION_CONFLICT',
    })
    writeScenario({ edge: '429' })
    await expect(apiFetch('/me/trips')).rejects.toMatchObject({ status: 429, code: 'RATE_LIMITED' })
  })
})
