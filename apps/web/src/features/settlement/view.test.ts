import { describe, expect, it } from 'vitest'
import type { MemberSummary } from '../../api'
import {
  isWithdrawn,
  kstDateTime,
  memberState,
  orderByMember,
  originalAmountText,
  paymentDateMeta,
  routeDate,
  settlementRowLabel,
  settlementText,
  toPerson,
} from './view'

const member = (nickname: string, joinOrder: number, extra: Partial<MemberSummary> = {}): MemberSummary => ({
  membershipId: `m-${nickname}`,
  nickname,
  profileImageUrl: null,
  role: 'MEMBER',
  joinOrder,
  isMe: false,
  isLeft: false,
  isWithdrawn: false,
  ...extra,
})

describe('정산 ± 표기(0-5)', () => {
  it('부호 + 라벨을 같이', () => {
    expect(settlementText('RECEIVE', 103_090)).toEqual({ net: 'receive', amount: '+₩103,090', label: '받을 돈' })
    expect(settlementText('SEND', -26_340)).toEqual({ net: 'send', amount: '−₩26,340', label: '보낼 돈' })
    expect(settlementText('EVEN', 0)).toEqual({ net: 'even', amount: '₩0', label: '정산 끝' })
  })

  it('행 접근성 이름은 부호 대신 받을 돈·보낼 돈으로 읽는다', () => {
    const row = { paidKrw: 132_360, burdenKrw: 200_155, netKrw: -67_795, direction: 'SEND' as const }
    expect(settlementRowLabel({ ...row, member: member('수빈', 4) }, true)).toBe(
      '수빈 (나간 멤버), 결제 ₩132,360, 부담 ₩200,155, 보낼 돈 ₩67,795',
    )
    expect(
      settlementRowLabel({ member: member('준용', 1, { isMe: true }), paidKrw: 1, burdenKrw: 0, netKrw: 1, direction: 'RECEIVE' }, false),
    ).toBe('준용 (나), 결제 ₩1, 부담 ₩0, 받을 돈 ₩1')
  })
})

describe('날짜·메타', () => {
  it('KST "MM.DD HH:mm" + 결제자', () => {
    expect(kstDateTime('2026-11-12T11:20:00+09:00')).toBe('11.12 11:20')
    expect(kstDateTime('2026-11-12T02:20:00Z')).toBe('11.12 11:20')
    expect(paymentDateMeta('2026-11-12T11:20:00+09:00', { name: '민지' })).toBe('11.12 11:20 · 민지')
    expect(paymentDateMeta('2026-11-12T11:20:00+09:00', { name: '준용', me: true })).toBe('11.12 11:20 · 내 결제')
  })

  it('경로 라벨 "MM.DD (요일)"', () => {
    expect(routeDate('2026-11-12')).toBe('11.12 (목)')
    expect(routeDate('2026-11-15')).toBe('11.15 (일)')
    expect(routeDate('2026-08-21')).toBe('08.21 (금)')
  })
})

describe('원통화', () => {
  it('KRW는 숨기고, 기호 없는 통화는 코드 뒤에', () => {
    expect(originalAmountText('36400', 'KRW')).toBeUndefined()
    expect(originalAmountText('5960', 'JPY')).toBe('¥5,960')
    expect(originalAmountText('12.50', 'USD')).toBe('$12.50')
    expect(originalAmountText('1200', 'MYR')).toBe('1,200 MYR')
  })
})

describe('나간 멤버 · 탈퇴한 멤버', () => {
  it('나간 멤버는 흐림 + 태그, 탈퇴한 멤버는 둘 다 없음', () => {
    expect(memberState(member('수빈', 4, { isLeft: true }))).toEqual({ withdrawn: false, left: true })
    expect(memberState(member('수빈', 4), true)).toEqual({ withdrawn: false, left: true })
    const gone = member('탈퇴한 멤버', 5, { isLeft: true, isWithdrawn: true })
    expect(memberState(gone)).toEqual({ withdrawn: true, left: false })
    expect(toPerson(gone)).toMatchObject({ name: '탈퇴한 멤버', source: 'default' })
    expect(toPerson(gone).left).toBeUndefined()
    // 서버 isWithdrawn만 본다: 같은 닉네임이어도 플래그가 없으면 실제 사용자
    expect(isWithdrawn(member('탈퇴한 멤버', 6))).toBe(false)
  })
})

it('사람 행은 나 먼저 → 가입 순(C-05)', () => {
  const rows = [member('민지', 2), member('수빈', 4), member('준용', 1, { isMe: true }), member('태현', 3)].map((m) => ({
    member: m,
  }))
  expect(orderByMember(rows).map((r) => r.member.nickname)).toEqual(['준용', '민지', '태현', '수빈'])
})
