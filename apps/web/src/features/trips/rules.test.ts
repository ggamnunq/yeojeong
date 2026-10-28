import { describe, expect, it } from 'vitest'
import { db, findTrip, TRIP, tripDetail } from '../../mocks/data'
import {
  budgetDigits,
  EMPTY_TRIP_FORM,
  formatBudgetInput,
  formatInviteCode,
  formatPeriodInput,
  formatRouteDate,
  formValuesOf,
  inviteInputChars,
  isStartPeriodOver,
  isTripFormValid,
  periodError,
  periodLimits,
  todayKst,
  tripHero,
  tripMetaLine,
  tripPermissions,
  tripUpdateBody,
  TRIP_EDITABLE_FIELDS,
} from './rules'
import type { TripFormValues } from './types'

const TODAY = '2026-11-13'
const detail = (tripId: string) => tripDetail(findTrip(tripId)!)
const asLeader = (tripId: string) => {
  for (const m of db.memberships) if (m.tripId === tripId) m.role = m.userId === db.meUserId ? 'LEADER' : 'MEMBER'
}

describe('날짜 표기', () => {
  it('오늘(KST)은 UTC 자정 전후에도 한국 날짜', () => {
    expect(todayKst(new Date('2026-11-12T15:30:00Z'))).toBe('2026-11-13')
    expect(todayKst(new Date('2026-11-12T14:59:00Z'))).toBe('2026-11-12')
  })

  it('경로 라벨 "11.12 (목)" · 입력값 "2026.11.12 (목) – 2026.11.15 (일)"', () => {
    expect(formatRouteDate('2026-11-12')).toBe('11.12 (목)')
    expect(formatPeriodInput('2026-11-12', '2026-11-15')).toBe('2026.11.12 (목) – 2026.11.15 (일)')
  })
})

describe('초대코드 입력', () => {
  it('소문자·하이픈·공백을 정리하고 6자까지, 4번째 글자부터 3-3 하이픈', () => {
    expect(inviteInputChars('k7m-2qx')).toBe('K7M2QX')
    expect(inviteInputChars(' K7M 2QX9 ')).toBe('K7M2QX')
    expect(formatInviteCode('K7M')).toBe('K7M')
    expect(formatInviteCode('K7M2')).toBe('K7M-2')
    expect(formatInviteCode('K7M2QX')).toBe('K7M-2QX')
  })
})

describe('예산 입력(FR-201 수락 기준 4)', () => {
  it('숫자만 남기고 "₩1,200,000"으로 보인다', () => {
    expect(budgetDigits('1200000')).toBe('1200000')
    expect(budgetDigits('₩1,200,0005', '1200000')).toBe('12000005')
    expect(formatBudgetInput('1200000')).toBe('₩1,200,000')
    expect(formatBudgetInput('')).toBe('')
  })

  it('범위(10억)를 넘는 입력은 막는다', () => {
    expect(budgetDigits('1000000000')).toBe('1000000000')
    expect(budgetDigits('1000000001', '100000000')).toBe('100000000')
    expect(budgetDigits('0')).toBe('')
  })
})

describe('기간 검증(FR-201 · Q-29 추천안)', () => {
  const create = { kind: 'create' } as const

  it('종료일 ≥ 시작일, 31일 이하, 시작일 ≥ 오늘 − 30일', () => {
    expect(periodError({ startDate: '2026-11-20', endDate: '2026-11-23' }, create, TODAY)).toBeNull()
    expect(periodError({ startDate: '2026-11-20', endDate: '2026-11-19' }, create, TODAY)).toBe('종료일을 확인해 주세요')
    expect(periodError({ startDate: '2026-11-20', endDate: '2026-12-21' }, create, TODAY)).toBe('종료일을 확인해 주세요')
    expect(periodError({ startDate: '2026-11-20', endDate: '2026-12-20' }, create, TODAY)).toBeNull()
    expect(periodError({ startDate: '2026-10-13', endDate: '2026-10-15' }, create, TODAY)).toBe('종료일을 확인해 주세요')
    expect(periodError({ startDate: '', endDate: '' }, create, TODAY)).toBeNull()
  })

  it('진행 중 수정은 시작일을 보지 않고 종료일은 오늘 이후만(FR-302 수락 기준 3)', () => {
    const ongoing = { kind: 'edit', status: 'ONGOING' } as const
    expect(periodLimits('2026-11-12', ongoing, '2026-11-14').endMin).toBe('2026-11-14')
    expect(periodError({ startDate: '2026-11-12', endDate: '2026-11-13' }, ongoing, '2026-11-14')).toBe('종료일을 확인해 주세요')
    expect(periodError({ startDate: '2026-09-01', endDate: '2026-11-15' }, ongoing, TODAY)).toBe('종료일을 확인해 주세요')
    expect(periodError({ startDate: '2026-11-12', endDate: '2026-11-16' }, ongoing, TODAY)).toBeNull()
  })

  it('네 칸이 모두 유효해야 만들 수 있다', () => {
    const values: TripFormValues = {
      groupName: ' 오사카 3박 4일 ',
      place: { countryCode: 'JP', city: '오사카', label: '일본 오사카' },
      startDate: '2026-11-20',
      endDate: '2026-11-23',
      budget: '1200000',
    }
    expect(isTripFormValid(values, create, TODAY)).toBe(true)
    expect(isTripFormValid(EMPTY_TRIP_FORM, create, TODAY)).toBe(false)
    expect(isTripFormValid({ ...values, groupName: '   ' }, create, TODAY)).toBe(false)
    expect(isTripFormValid({ ...values, place: null }, create, TODAY)).toBe(false)
    expect(isTripFormValid({ ...values, budget: '' }, create, TODAY)).toBe(false)
    expect(isTripFormValid({ ...values, endDate: '2026-11-19' }, create, TODAY)).toBe(false)
  })
})

describe('수정 요청 본문', () => {
  it('고칠 수 있는 칸 중 바뀐 것만 + version, 없으면 null', () => {
    const initial = formValuesOf(detail(TRIP.osaka))
    const editable = TRIP_EDITABLE_FIELDS.ONGOING
    expect(tripUpdateBody(initial, initial, editable, 3)).toBeNull()
    expect(tripUpdateBody(initial, { ...initial, groupName: '오사카 먹방 ', budget: '1500000' }, editable, 3)).toEqual({
      groupName: '오사카 먹방',
      budgetKrw: 1_500_000,
      version: 3,
    })
    // 진행 중에는 장소·시작일을 보내지 않는다
    const moved = { ...initial, place: { countryCode: 'JP', city: '교토', label: '일본 교토' }, startDate: '2026-11-11' }
    expect(tripUpdateBody(initial, moved, editable, 3)).toBeNull()
  })
})

describe('권한·단계(spec README §5 · 기능명세 4-8)', () => {
  it('진행 중 그룹장: 수정(그룹명·예산·종료일)·종료·초대, 시작·삭제 없음', () => {
    expect(tripPermissions(detail(TRIP.osaka), TODAY)).toMatchObject({
      canEdit: true,
      editableFields: ['groupName', 'budgetKrw', 'endDate'],
      canStart: false,
      canEnd: true,
      canDeleteGroup: false,
      canInvite: true,
    })
  })

  it('시작 전 멤버: 버튼 권한 없음, 초대는 가능', () => {
    expect(tripPermissions(detail(TRIP.busan), TODAY)).toMatchObject({
      canEdit: false,
      canStart: false,
      canDeleteGroup: false,
      canInvite: true,
    })
  })

  it('시작 전 그룹장: 전 항목 수정·시작·삭제. 종료일이 지났으면 시작 불가(Q-26)', () => {
    asLeader(TRIP.busan)
    expect(tripPermissions(detail(TRIP.busan), TODAY)).toMatchObject({ canEdit: true, canStart: true, canDeleteGroup: true })
    const expired = { ...detail(TRIP.busan), startDate: '2026-11-01', endDate: '2026-11-02' }
    expect(isStartPeriodOver(expired, TODAY)).toBe(true)
    expect(tripPermissions(expired, TODAY)).toMatchObject({ canStart: false, canDeleteGroup: true })
  })

  it('종료 후: 읽기 전용(수정·초대 없음)', () => {
    expect(tripPermissions(detail(TRIP.jeju), TODAY)).toMatchObject({ canEdit: false, canEnd: false, canInvite: false })
  })

  it('서버가 permissions를 주면 그대로 쓴다', () => {
    const fromServer = { ...detail(TRIP.osaka), permissions: { ...tripPermissions(detail(TRIP.osaka), TODAY), canEnd: false } }
    expect(tripPermissions(fromServer, TODAY).canEnd).toBe(false)
  })
})

describe('영웅 카드', () => {
  it('시작 전 "출발까지 D-n" · 당일 D-day · 시작일 지남 "시작 전"', () => {
    const busan = detail(TRIP.busan)
    expect(tripHero(busan, TODAY)).toEqual({ label: '출발까지', value: `D-${busan.dDay}` })
    expect(tripHero({ ...busan, dDay: 0, startDate: TODAY }, TODAY).value).toBe('D-day')
    expect(tripHero({ ...busan, startDate: '2026-11-01' }, TODAY).value).toBe('시작 전')
  })

  it('진행 중 "여행 중 Day 2 / 4"(서버 todayDayIndex가 먼저) · 종료 "종료 2박 3일"', () => {
    const osaka = detail(TRIP.osaka)
    expect(tripHero(osaka, TODAY)).toEqual({ label: '여행 중', value: 'Day 2', suffix: '/ 4' })
    expect(tripHero({ ...osaka, todayDayIndex: 3 }, TODAY).value).toBe('Day 3')
    expect(tripHero(detail(TRIP.jeju), TODAY)).toEqual({ label: '종료', value: '2박 3일' })
  })

  it('메타 한 줄 "일본 오사카 · 예산 ₩1,200,000"', () => {
    expect(tripMetaLine(detail(TRIP.osaka))).toBe('일본 오사카 · 예산 ₩1,200,000')
  })
})
