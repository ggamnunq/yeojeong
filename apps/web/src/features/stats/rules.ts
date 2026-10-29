import type { TripSummary } from '../settlement/types'

// 현황 표시 규칙(기능명세 4-6·4-9, 화면명세 WF-22). 값은 서버가 계산하고 화면은 라벨·막대 폭만 정한다.

/** 영웅: 받을 돈이 있으면 "내가 받을 금액"(제안), 아니면 "내가 낼 금액"(0이면 ₩0) */
export function heroOf(me: TripSummary['me']) {
  return me.toReceiveKrw > 0
    ? { label: '내가 받을 금액', amount: me.toReceiveKrw }
    : { label: '내가 낼 금액', amount: me.toPayKrw }
}
