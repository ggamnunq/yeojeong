import { describe, expect, it } from 'vitest'
import type { TripListItem, TripStatus } from '../api'
import { defaultTab, isTabOpen, pickEntryTrip, sortTrips, tripTabs } from './tripRules'

const trip = (tripId: string, status: TripStatus, startDate: string, endDate: string): TripListItem => ({
  tripId,
  groupId: `g-${tripId}`,
  groupName: tripId,
  status,
  startDate,
  endDate,
  memberCount: 3,
  isLeader: false,
})

const osaka = trip('osaka', 'ONGOING', '2026-11-12', '2026-11-15')
const tokyo = trip('tokyo', 'ONGOING', '2026-11-10', '2026-11-20')
const busan = trip('busan', 'UPCOMING', '2026-12-27', '2026-12-28')
const seoul = trip('seoul', 'UPCOMING', '2026-12-01', '2026-12-02')
const jeju = trip('jeju', 'ENDED', '2026-08-21', '2026-08-23')
const gangneung = trip('gangneung', 'ENDED', '2026-09-01', '2026-09-02')

describe('단계별 탭(FR-001)', () => {
  it('시작 전: 결제내역·현황 잠금, 기본 여정 정보', () => {
    expect(tripTabs('UPCOMING').map((t) => [t.tab, t.label, t.locked])).toEqual([
      ['payments', '결제내역', true],
      ['stats', '현황', true],
      ['info', '여정 정보', false],
    ])
    expect(defaultTab('UPCOMING')).toBe('info')
  })

  it('진행 중: 모두 열림, 기본 결제내역', () => {
    expect(tripTabs('ONGOING').every((t) => !t.locked)).toBe(true)
    expect(tripTabs('ONGOING')[1].label).toBe('현황')
    expect(defaultTab('ONGOING')).toBe('payments')
  })

  it('종료 후: 2번 탭이 정산, 기본 정산', () => {
    expect(tripTabs('ENDED')[1]).toEqual({ tab: 'settlement', label: '정산', locked: false })
    expect(defaultTab('ENDED')).toBe('settlement')
  })

  it('이 단계에 없거나 잠긴 탭은 열 수 없다', () => {
    expect(isTabOpen('UPCOMING', 'payments')).toBe(false)
    expect(isTabOpen('ONGOING', 'settlement')).toBe(false)
    expect(isTabOpen('ENDED', 'stats')).toBe(false)
    expect(isTabOpen('ENDED', 'payments')).toBe(true)
  })
})

describe('여정 정렬(FR-205)', () => {
  it('진행 중(시작일 늦은 순) → 시작 전(시작일 빠른 순) → 종료(종료일 늦은 순)', () => {
    expect(sortTrips([jeju, busan, tokyo, gangneung, seoul, osaka]).map((t) => t.tripId)).toEqual([
      'osaka',
      'tokyo',
      'seoul',
      'busan',
      'gangneung',
      'jeju',
    ])
  })
})

describe('진입 라우팅(FR-102)', () => {
  it('기기에 기억한 여정 → 서버 lastViewedTripId → 정렬 첫 여정', () => {
    const data = { lastViewedTripId: 'busan', items: [jeju, busan, osaka] }
    expect(pickEntryTrip(data, 'jeju')?.tripId).toBe('jeju')
    expect(pickEntryTrip(data, null)?.tripId).toBe('busan')
    expect(pickEntryTrip({ ...data, lastViewedTripId: null })?.tripId).toBe('osaka')
  })

  it('기억한 여정이 목록에 없으면(나감·강퇴) 건너뛴다', () => {
    expect(pickEntryTrip({ lastViewedTripId: 'gone', items: [jeju, busan] }, 'gone')?.tripId).toBe('busan')
  })

  it('소속 여정이 없으면 null', () => {
    expect(pickEntryTrip({ lastViewedTripId: null, items: [] })).toBeNull()
    expect(pickEntryTrip(undefined)).toBeNull()
  })
})
