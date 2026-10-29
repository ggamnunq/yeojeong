import type { MemberSummary } from '../api'
import type { AvatarPerson } from '../ds'

// 서버 MemberSummary → 화면 사람 표기(화면명세 0-8). 결제·정산·현황·그룹원 화면이 모두 이것을 쓴다.

/** 탈퇴한 멤버의 표시 이름(서버가 nickname으로 같은 값을 준다, 용어집 "탈퇴한 멤버") */
export const WITHDRAWN_NICKNAME = '탈퇴한 멤버'

/** 탈퇴(ACCOUNT_DELETED)한 멤버인가. 서버 isWithdrawn만 본다 */
export const isWithdrawn = (member: Pick<MemberSummary, 'isWithdrawn'>) => member.isWithdrawn === true

/**
 * MemberSummary → DS AvatarPerson. 서버 joinOrder는 1부터, DS 이니셜 색은 0부터.
 * - 탈퇴한 멤버: "탈퇴한 멤버" + 회색 기본 아바타(흐림·「나간 멤버」 태그 없음)
 * - 나간 멤버(LEFT·KICKED): 프사 흐림(left). 태그는 쓰는 곳이 붙인다
 */
export const toPerson = (member: MemberSummary): AvatarPerson => toPersonAt(member, member.isLeft)

/** toPerson과 같고 나간 멤버 여부만 응답의 다른 값(정산의 종료 시점 isLeft)으로 정할 때 */
export function toPersonAt(member: MemberSummary, left: boolean): AvatarPerson {
  if (isWithdrawn(member)) {
    return { name: WITHDRAWN_NICKNAME, src: null, source: 'default', joinOrder: member.joinOrder - 1 }
  }
  return { name: member.nickname, src: member.profileImageUrl, joinOrder: member.joinOrder - 1, me: member.isMe, left }
}

/** 표시 상태: 탈퇴한 멤버는 태그 없음·탭 불가, 나간 멤버는 흐림 + 「나간 멤버」 태그 */
export function memberState(member: MemberSummary, leftAtEnd = false) {
  const withdrawn = isWithdrawn(member)
  return { withdrawn, left: !withdrawn && (leftAtEnd || member.isLeft) }
}
