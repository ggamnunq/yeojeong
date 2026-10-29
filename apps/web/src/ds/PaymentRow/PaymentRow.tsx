import { clsx } from 'clsx'
import type { ButtonHTMLAttributes, ReactNode } from 'react'
import { Avatar } from '../Avatar/Avatar'
import type { AvatarPerson } from '../Avatar/rules'
import { AvatarStack } from '../AvatarStack/AvatarStack'
import { avatarStackLabel } from '../AvatarStack/rules'
import { formatKrw } from '../format'
import { Icon } from '../Icon/Icon'
import { focusRing } from '../styles'
import { Tag } from '../Tag/Tag'

// Figma PaymentRow(24:8257) · Type × State(Pressed = :active) + Changed. 결제 내역 한 줄(누르면 결제 상세).
// Shared = 부담 인원 스택 · Personal/Duplicate/Refund = 메타 줄 앞 Tag · Pending = 메타 줄 끝 회색 "미확정" + 금액 보조색.
// Changed(v1.4) = 메타 줄 끝 중립 회색 "변경됨" 칩(Tag Type=Changed).
// Avatar#88:2 off(v1.6.3) = leading="none"(HF-49 내 지갑) — 왼쪽 프사 없음. 메타 "HH:mm · {여정 이름}"(walletMeta) + 오른쪽 원통화 보조 줄. 행 높이 70.
export type PaymentRowType = 'shared' | 'personal' | 'pending' | 'refund' | 'duplicate'
/** 왼쪽 자리: avatar = 결제자 프사(기본), none = 없음(내 지갑 HF-49) */
export type PaymentRowLeading = 'avatar' | 'none'

type PaymentRowLeadingProps =
  | {
      /** Figma Leading. 기본 avatar */
      leading?: 'avatar'
      /** Figma payer avatar (Avatar M). 메타에 결제자 이름이 있으니 화면리더에는 숨긴다 */
      payer: AvatarPerson
    }
  | {
      /** Figma Leading=None(DS18): 프사 없이 내용·메타·금액만 — 내 지갑 행(HF-49) */
      leading: 'none'
      payer?: never
    }

export type PaymentRowProps = Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'type' | 'children'> &
  PaymentRowLeadingProps & {
  type?: PaymentRowType
  /** Figma merchant */
  merchant: ReactNode
  /** Figma meta: "12:40 · 민지" / "14:05 · 내 결제"(paymentMeta). Refund는 "원 결제 10.28 12:40 · 취소". 지갑 행은 "08:50 · 오사카"(walletMeta) */
  meta: ReactNode
  /** 원화 금액. Refund는 부호와 상관없이 −로 보여 준다 */
  amount: number
  /** Figma original amount: "¥3,200"(formatMoney로 만든다) */
  originalAmount?: ReactNode
  /** Figma participants: 부담 인원(Shared만). 나 먼저 → 가입 순 */
  participants?: readonly AvatarPerson[]
  /** Figma Changed: 공동 결제가 수정됨 → 메타 줄 끝 "변경됨" 칩 */
  changed?: boolean
  htmlType?: 'button' | 'submit' | 'reset'
  children?: never
}

const TAG = { personal: 'personal', refund: 'refund', duplicate: 'duplicate' } as const

export function PaymentRow({
  type = 'shared',
  leading = 'avatar',
  payer,
  merchant,
  meta,
  amount,
  originalAmount,
  participants,
  changed = false,
  htmlType = 'button',
  className,
  ...rest
}: PaymentRowProps) {
  const leadingTag = type === 'personal' || type === 'refund' || type === 'duplicate' ? TAG[type] : null
  const quiet = type === 'pending' || type === 'refund' || type === 'duplicate'

  return (
    <button
      type={htmlType}
      className={clsx(
        'flex w-full items-center gap-3 bg-surface px-5 py-3.5 text-left transition-colors select-none enabled:active:bg-pressed',
        focusRing,
        className,
      )}
      {...rest}
    >
      {leading === 'avatar' && payer && <Avatar {...payer} size="m" alt="" />}
      <span className="flex min-w-0 flex-1 flex-col gap-1">
        <span className="truncate text-body-m-strong text-primary">{merchant}</span>
        <span className="flex min-w-0 items-center gap-1.5">
          {type === 'shared' && participants && participants.length > 0 && (
            <AvatarStack people={participants} size="xs" label={`부담 인원 ${avatarStackLabel(participants)}`} />
          )}
          {leadingTag && <Tag type={leadingTag} size="s" />}
          {type === 'refund' && <Icon name="link" size={12} className="shrink-0 text-icon-subtle" />}
          <span className="min-w-0 truncate text-caption text-tertiary">{meta}</span>
          {changed && <Tag type="changed" size="s" />}
          {type === 'pending' && <Tag type="pending" size="s" />}
        </span>
      </span>
      <span className="flex shrink-0 flex-col items-end gap-0.5">
        <span className={clsx('font-amount text-amount-s whitespace-nowrap', quiet ? 'text-secondary' : 'text-amount-default')}>
          {formatKrw(type === 'refund' ? -Math.abs(amount) : amount)}
        </span>
        {originalAmount != null && (
          <span className="font-amount text-caption font-medium whitespace-nowrap text-tertiary">{originalAmount}</span>
        )}
      </span>
    </button>
  )
}
