import type { AvatarPerson } from '../Avatar/rules'

// 결제자 표기 규칙(spec C-06, 사용자 결정 2026-10-28 · hifi direction 7-1).
// 내 결제는 "내 결제", 다른 멤버는 닉네임만("결제"·"님" 접미사 없음 — 왼쪽 프사가 결제자다).
// PaymentRow · TimelineItem · 결제 상세 · 멤버별 내역 등 결제자가 나오는 모든 메타 줄에 같은 규칙을 쓴다.

/** 메타 줄의 결제자 부분: 나 = "내 결제", 남 = 닉네임 */
export function payerLabel(payer: Pick<AvatarPerson, 'name' | 'me'>) {
  return payer.me ? '내 결제' : payer.name
}

/**
 * PaymentRow meta: "18:20 · 내 결제" / "16:40 · 민지".
 * time은 이미 HH:mm으로 만든 글자를 받는다(어느 시간대로 보일지는 화면이 정한다).
 * 미확정은 meta 뒤에 붙이지 않는다 — PaymentRow type="pending"이 "미확정" 칩을 메타 줄 끝에 그린다.
 */
export function paymentMeta(time: string, payer: Pick<AvatarPerson, 'name' | 'me'>) {
  return `${time} · ${payerLabel(payer)}`
}

/**
 * 내 지갑 행(PaymentRow leading="none", HF-49) meta: "08:50 · 오사카 3박 4일".
 * 연결된 여정이 없으면(또는 나간·삭제된 여정) 시각만 "08:50". 여정 이름은 그룹명 그대로 — 길면 행이 말줄임한다.
 */
export function walletMeta(time: string, tripName?: string | null) {
  const name = tripName?.trim()
  return name ? `${time} · ${name}` : time
}
