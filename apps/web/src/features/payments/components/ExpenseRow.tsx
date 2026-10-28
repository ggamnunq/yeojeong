import { clsx } from 'clsx'
import type { ExpenseListItem } from '../../../api'
import {
  Avatar,
  AvatarStack,
  avatarStackLabel,
  formatKrw,
  orderMembers,
  PaymentRow,
  paymentMeta,
  Tag,
  type PaymentRowType,
} from '../../../ds'
import { focusRing } from '../../../ds/styles'
import { formatOriginal, grossKrw, kst, toPerson } from '../rules'

// 결제 행(화면명세 0-7). 기본은 DS PaymentRow. DS에 없는 두 변형은 같은 치수로 여기서 조합한다(DS 추가 요청):
// - PaymentRow Flag=Duplicate(v1.4 #25): 공동 스택을 유지한 채 앞에 "중복 의심" 태그
// - PaymentGroup/Refund(v1.4 #12): 톤 카드 안 원 결제 행 + "12:15 취소" 줄 + 합계

const ROW_TYPE = { SHARED: 'shared', PERSONAL: 'personal', PENDING: 'pending' } as const satisfies Record<
  ExpenseListItem['status'],
  PaymentRowType
>

const participantsOf = (item: ExpenseListItem) =>
  item.status === 'SHARED' && item.participants ? orderMembers(item.participants.map(toPerson)) : []

const metaOf = (item: ExpenseListItem) => paymentMeta(kst(item.occurredAt).time, toPerson(item.payer))

export type ExpenseRowProps = {
  item: ExpenseListItem
  onOpen: (item: ExpenseListItem) => void
}

/** 리스트 한 줄. 환불 묶음·중복 의심은 알맞은 변형으로 */
export function ExpenseRow({ item, onOpen }: ExpenseRowProps) {
  if (item.refunds.length > 0) return <RefundGroupRow item={item} onOpen={onOpen} />
  if (item.flags.duplicateSuspected) {
    return (
      <button
        type="button"
        onClick={() => onOpen(item)}
        className={clsx(
          'flex w-full items-center gap-3 bg-surface px-5 py-3.5 text-left transition-colors select-none active:bg-pressed',
          focusRing,
        )}
      >
        <RowContent item={item} amount={item.krwAmount} duplicate />
      </button>
    )
  }
  return (
    <PaymentRow
      type={ROW_TYPE[item.status]}
      payer={toPerson(item.payer)}
      merchant={item.merchantName}
      meta={metaOf(item)}
      amount={item.krwAmount}
      originalAmount={formatOriginal(item.originalAmount, item.originalCurrency)}
      participants={participantsOf(item)}
      changed={item.flags.changed}
      onClick={() => onOpen(item)}
    />
  )
}

/** PaymentRow와 같은 치수의 행 내용(button 안에 넣는 span만) */
function RowContent({ item, amount, duplicate = false, ring = false }: { item: ExpenseListItem; amount: number; duplicate?: boolean; ring?: boolean }) {
  const participants = participantsOf(item)
  const original = formatOriginal(item.originalAmount, item.originalCurrency)
  const pending = item.status === 'PENDING'
  return (
    <>
      <Avatar {...toPerson(item.payer)} size="m" ring={ring} alt="" />
      <span className="flex min-w-0 flex-1 flex-col gap-1">
        <span className="truncate text-body-m-strong text-primary">{item.merchantName}</span>
        <span className="flex min-w-0 items-center gap-1.5">
          {duplicate && <Tag type="duplicate" size="s" />}
          {item.status === 'PERSONAL' && <Tag type="personal" size="s" />}
          {participants.length > 0 && (
            <AvatarStack people={participants} size="xs" label={`부담 인원 ${avatarStackLabel(participants)}`} />
          )}
          <span className="min-w-0 truncate text-caption text-tertiary">{metaOf(item)}</span>
          {item.flags.changed && <Tag type="changed" size="s" />}
          {pending && <Tag type="pending" size="s" />}
        </span>
      </span>
      <span className="flex shrink-0 flex-col items-end gap-0.5">
        <span className={clsx('font-amount text-amount-s whitespace-nowrap', pending ? 'text-secondary' : 'text-amount-default')}>
          {formatKrw(amount)}
        </span>
        {original && <span className="font-amount text-caption font-medium whitespace-nowrap text-tertiary">{original}</span>}
      </span>
    </>
  )
}

/** 환불 묶음(WF-40): 톤 카드 한 장 = 원 결제 행(원 금액) + 취소 줄(시각 → 동작) + 합계(순액). 누르면 WF-41 */
function RefundGroupRow({ item, onOpen }: ExpenseRowProps) {
  const refunds = [...item.refunds].sort((a, b) => a.occurredAt.localeCompare(b.occurredAt))
  return (
    <div className="px-3 py-1">
      <button
        type="button"
        onClick={() => onOpen(item)}
        className={clsx(
          'flex w-full flex-col rounded-lg bg-subtle pb-3.5 text-left transition-[filter] select-none active:brightness-95',
          focusRing,
        )}
      >
        <span className="flex w-full items-center gap-3 px-2 pt-3.5 pb-1.5">
          <RowContent item={item} amount={grossKrw(item)} duplicate={item.flags.duplicateSuspected} ring />
        </span>
        {refunds.map((refund) => (
          <span key={refund.id} className="flex w-full items-center justify-between pr-2 pl-14 text-secondary">
            <span className="text-body-s">{kst(refund.occurredAt).time} 취소</span>
            <span className="font-amount text-amount-s whitespace-nowrap">{formatKrw(refund.krwAmount)}</span>
          </span>
        ))}
        <span className="flex w-full items-center justify-between pt-2 pr-2 pl-14">
          <span className="text-body-s-strong text-primary">합계</span>
          <span className="font-amount text-amount-s whitespace-nowrap text-amount-default">{formatKrw(item.krwAmount)}</span>
        </span>
      </button>
    </div>
  )
}
