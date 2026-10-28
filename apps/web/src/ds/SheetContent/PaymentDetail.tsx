import { clsx } from 'clsx'
import { useId, type HTMLAttributes, type ReactNode } from 'react'
import type { AvatarPerson } from '../Avatar/rules'
import { AvatarToggle } from '../AvatarToggle/AvatarToggle'
import { formatKrw } from '../format'
import { SegmentedControl } from '../SegmentedControl/SegmentedControl'
import { Tag } from '../Tag/Tag'
import { splitEvenly } from './rules'

// Figma SheetContent/PaymentDetail(24:18023) + Pending · Changed · Person 3~6 · Remainder(v1.4)
// BottomSheet Content 슬롯에 넣는 결제 상세(편집) 내용. 시트 자체(손잡이·제목·CTA)는 BottomSheet가 맡는다.
// 금액 요약 → 개인/공동 전환(SegmentedControl) → 부담 인원 AvatarToggle(인원 수만큼, 줄바꿈).
export type PaymentExpenseType = 'personal' | 'shared'

export type PaymentDetailParticipant = AvatarPerson & {
  /** 부담 인원에 들어가는지 */
  selected: boolean
}

export type SheetContentPaymentDetailProps = Omit<HTMLAttributes<HTMLDivElement>, 'children'> & {
  /** Figma merchant */
  merchant: ReactNode
  /** 원화 금액(Amount/L) */
  amount: number
  /** Figma detail: "¥3,200 · 100엔 = 887.5원 · 10.28 12:40 · 민지" */
  detail: ReactNode
  /** Figma Pending: detail 줄 끝 "미확정" */
  pending?: boolean
  /** Figma Changed: detail 줄 끝 "변경됨" */
  changed?: boolean
  /** Figma expense type: SegmentedControl First = 개인, Second = 공동 */
  expenseType: PaymentExpenseType
  onExpenseTypeChange?: (type: PaymentExpenseType) => void
  /** Figma toggle · 이름(Person 3~6 = 인원 수). 나 먼저 → 가입 순 */
  participants?: readonly PaymentDetailParticipant[]
  onParticipantChange?: (index: number, selected: boolean) => void
  /** 개인 결제일 때 부담 인원을 숨기지 않고 비활성으로 보인다(AvatarToggle disabled). 기본은 숨김 */
  showParticipantsWhenPersonal?: boolean
  /** Figma per person. 기본 "1인 ₩(금액 ÷ 선택 인원, 내림)" */
  perPerson?: ReactNode
  /** Figma Remainder. 기본은 나머지가 있으면 "결제자 +N원" */
  remainder?: ReactNode
  children?: never
}

export function SheetContentPaymentDetail({
  merchant,
  amount,
  detail,
  pending = false,
  changed = false,
  expenseType,
  onExpenseTypeChange,
  participants = [],
  onParticipantChange,
  showParticipantsWhenPersonal = false,
  perPerson,
  remainder,
  className,
  ...rest
}: SheetContentPaymentDetailProps) {
  const titleId = useId()
  const shared = expenseType === 'shared'
  const count = participants.filter((p) => p.selected).length
  const split = splitEvenly(amount, count)
  const showParticipants = participants.length > 0 && (shared || showParticipantsWhenPersonal)

  return (
    <div className={clsx('flex flex-col gap-4 bg-surface', className)} {...rest}>
      <div className="flex flex-col gap-0.5">
        <p className="text-body-m-strong text-secondary">{merchant}</p>
        <p className="font-amount text-amount-l text-amount-default">{formatKrw(amount)}</p>
        <p className="flex flex-wrap items-center gap-1.5">
          <span className="text-caption text-tertiary">{detail}</span>
          {changed && <Tag type="changed" size="s" />}
          {pending && <Tag type="pending" size="s" />}
        </p>
      </div>
      <SegmentedControl
        aria-label="결제 구분"
        labels={['개인', '공동']}
        selected={shared ? 'second' : 'first'}
        onChange={(selected) => onExpenseTypeChange?.(selected === 'second' ? 'shared' : 'personal')}
      />
      {/* 개인 결제에는 부담 인원이 없다 — 기본은 숨기고(EX-01b), 원하면 비활성(State=Disabled)으로 */}
      {showParticipants && (
        <div role="group" aria-labelledby={titleId} className="flex flex-col gap-4">
          <div className="flex items-center gap-2">
            <p id={titleId} className="text-body-s-strong text-primary">
              부담 인원 {count}명
            </p>
            {shared && count > 0 && (
              <p className="ml-auto flex items-center gap-2">
                {(remainder ?? split.remainder > 0) && (
                  <span className="text-caption text-tertiary">{remainder ?? `결제자 +${split.remainder}원`}</span>
                )}
                <span className="text-body-s text-secondary">{perPerson ?? `1인 ${formatKrw(split.perPerson)}`}</span>
              </p>
            )}
          </div>
          <div className="flex flex-wrap gap-x-0.5 gap-y-3">
            {participants.map(({ selected, ...person }, index) => (
              <AvatarToggle
                key={`${index}-${person.name}`}
                person={person}
                selected={selected}
                disabled={!shared}
                onChange={(on) => onParticipantChange?.(index, on)}
              />
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
