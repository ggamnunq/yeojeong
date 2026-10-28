import type { MemberSummary, TripDetail, TripEvent, TripListItem } from '../../api'
import type { AvatarPerson } from '../../ds'

// 셸(HF-13·14·15) 표시 규칙. 화면 없이 테스트한다.

/** 드롭다운 메타(HF #25): "진행 중" · "시작 전 · 12.27"(출발일) · "정산 완료" */
export function tripMeta(trip: Pick<TripListItem, 'status' | 'startDate'>): string {
  if (trip.status === 'ONGOING') return '진행 중'
  if (trip.status === 'ENDED') return '정산 완료'
  const [, month, day] = trip.startDate.split('-')
  return `시작 전 · ${month}.${day}`
}

/** 초대코드 3-3 표시: K7M2QX → K7M-2QX */
export const formatInviteCode = (code: string) => `${code.slice(0, 3)}-${code.slice(3)}`

export function toAvatarPerson(member: MemberSummary): AvatarPerson {
  return {
    name: member.nickname,
    src: member.profileImageUrl ?? undefined,
    joinOrder: member.joinOrder,
    me: member.isMe,
    left: member.isLeft,
  }
}

/** 강퇴 버튼: 그룹장 화면, 남의 행, 시작 전·진행 중(FR-207) */
export function canKick(trip: Pick<TripDetail, 'me' | 'status'>, member: MemberSummary): boolean {
  return trip.me.role === 'LEADER' && !member.isMe && !member.isLeft && trip.status !== 'ENDED'
}

/** 그룹 나가기 다이얼로그 한 줄(부록 C-2). 시작 전 멤버는 본문 없음 */
export function leaveMessage(trip: Pick<TripDetail, 'me' | 'status' | 'members'>): string {
  if (trip.me.role === 'LEADER') {
    const next = trip.members
      .filter((m) => !m.isMe && !m.isLeft)
      .sort((a, b) => a.joinOrder - b.joinOrder)[0]
    if (next) return `${next.nickname}님이 그룹장이 돼요`
  }
  return trip.status === 'UPCOMING' ? '' : '낸 결제와 부담은 정산에 남아요'
}

/** 1회성 이벤트 토스트 문구(FR-004). 모르는 이벤트는 null */
export function eventMessage(event: TripEvent): string | null {
  if (event.type === 'LEADER_CHANGED') {
    const nickname = event.payload.nickname
    return typeof nickname === 'string' ? `${nickname}님이 새 그룹장이에요` : null
  }
  if (event.type === 'FX_POLICY_CHANGED') return '새 환율로 다시 계산했어요'
  return null
}
