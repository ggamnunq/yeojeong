import { clsx } from 'clsx'
import type { HTMLAttributes, ReactNode } from 'react'
import { Avatar } from '../Avatar/Avatar'
import type { AvatarPerson } from '../Avatar/rules'
import { AvatarStack } from '../AvatarStack/AvatarStack'
import { avatarStackLabel } from '../AvatarStack/rules'
import { Button } from '../Button/Button'
import { formatKrw } from '../format'
import { Tag } from '../Tag/Tag'
import { splitEvenly } from './rules'

// Figma SheetContent/ReadOnly(24:68666) · Locked · Changed(BOOLEAN). BottomSheet Content 슬롯용 결제 상세(편집 불가).
// 결제자가 아닌 멤버가 연 공동 결제 · 종료 후 잠금 · 결제자가 나간 결제. 버튼이 없는 것으로 읽기 전용을 전한다("읽기 전용" 태그 없음).
// 금액(Amount/L) → 상세 줄(+ "변경됨") → 톤 카드(결제 = 프사 + 이름 · 부담 = 스택 + n명 · 1인) → Locked면 비활성 "변경 불가".
// 시트 제목(가맹점명)·닫기는 BottomSheet가 맡는다.
export type SheetContentReadOnlyProps = Omit<HTMLAttributes<HTMLDivElement>, 'children'> & {
  /** 원화 금액 — Figma amount */
  amount: number
  /** Figma detail: "¥2,860 · 11.13 14:10"(결제자가 아니면 결제수단 없음) */
  detail: ReactNode
  /** Figma Changed: 상세 줄 끝 "변경됨" */
  changed?: boolean
  /** Figma Locked: 아래에 비활성 Button Secondary L "변경 불가"(자물쇠) */
  locked?: boolean
  /** Figma payer: 결제자 프사(S) + 이름. 나는 "나"(spec C-06), 나간 멤버는 프사 Left + 「나간 멤버」 */
  payer: AvatarPerson
  /** Figma participants: 부담 인원 스택(S) + "n명". 나 먼저 → 가입 순(orderMembers) */
  participants: readonly AvatarPerson[]
  /** Figma per person. 기본 1인 = 금액 ÷ 인원(원 단위 내림, 나머지 표시 없음) */
  perPerson?: ReactNode
  children?: never
}

function Line({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex items-center gap-2">
      <dt className="shrink-0 text-body-s text-secondary">{label}</dt>
      <dd className="ml-auto flex min-w-0 items-center gap-1.5">{children}</dd>
    </div>
  )
}

export function SheetContentReadOnly({
  amount,
  detail,
  changed = false,
  locked = false,
  payer,
  participants,
  perPerson,
  className,
  ...rest
}: SheetContentReadOnlyProps) {
  const count = participants.length
  return (
    <div className={clsx('flex flex-col gap-5 bg-surface', className)} {...rest}>
      <div className="flex flex-col gap-0.5">
        <p className="font-amount text-amount-l text-amount-default">{formatKrw(amount)}</p>
        <p className="flex flex-wrap items-center gap-1.5">
          <span className="text-caption text-tertiary">{detail}</span>
          {changed && <Tag type="changed" size="s" />}
        </p>
      </div>
      {/* 톤 카드: bg/subtle · radius 16 · 패딩 16 · 줄 간격 14 */}
      <dl className="flex flex-col gap-3.5 rounded-lg bg-subtle p-4">
        <Line label="결제">
          <Avatar {...payer} size="s" ring alt="" />
          <span className="truncate text-body-s-strong text-primary">{payer.me ? '나' : payer.name}</span>
          {payer.left && <Tag type="left" size="s" />}
        </Line>
        <Line label="부담">
          {count > 0 && <AvatarStack people={participants} size="s" label={`부담 인원 ${avatarStackLabel(participants)}`} />}
          <span className="text-body-s-strong whitespace-nowrap text-primary">{count}명</span>
        </Line>
        <Line label="1인">
          <span className="font-amount text-amount-s whitespace-nowrap text-amount-default">
            {perPerson ?? formatKrw(splitEvenly(amount, count).perPerson)}
          </span>
        </Line>
      </dl>
      {locked && <Button type="secondary" size="l" disabled leadingIcon icon="lock" label="변경 불가" className="w-full" />}
    </div>
  )
}
