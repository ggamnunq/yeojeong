import { clsx } from 'clsx'
import type { HTMLAttributes } from 'react'
import { Avatar } from '../Avatar/Avatar'
import type { AvatarPerson } from '../Avatar/rules'
import { formatKrw } from '../format'
import { Icon } from '../Icon/Icon'
import { IconButton } from '../IconButton/IconButton'

// Figma TransferRow(24:8575). 정산 요약의 송금 권장안 한 줄(누가 → 누구에게 얼마). 실제 송금은 하지 않고 금액 복사만.
export type TransferRowProps = Omit<HTMLAttributes<HTMLDivElement>, 'children'> & {
  /** Figma from avatar · 보내는 사람 */
  from: AvatarPerson
  /** Figma to avatar · 받는 사람 */
  to: AvatarPerson
  /** 원화 금액 */
  amount: number
  /**
   * Figma copy(IconButton Ghost S). 기본 동작은 숫자만("48250") 클립보드에 복사한 뒤 호출한다.
   * 복사 결과 알림(Toast)은 화면에서 띄운다.
   */
  onCopyAmount?: (copied: string) => void
  /** 복사 버튼 접근성 이름 */
  copyLabel?: string
  children?: never
}

const displayName = (p: AvatarPerson) => (p.me ? '나' : p.name)

export function TransferRow({ from, to, amount, onCopyAmount, copyLabel, className, ...rest }: TransferRowProps) {
  const fromName = displayName(from)
  const toName = displayName(to)

  return (
    <div
      className={clsx('flex items-center gap-2.5 rounded-lg border border-default bg-surface py-3.5 pr-4 pl-5', className)}
      {...rest}
    >
      <Avatar {...from} size="s" alt="" />
      <Icon name="chevron-right" size={16} className="shrink-0 text-icon-subtle" />
      <Avatar {...to} size="s" alt="" />
      <p className="min-w-0 flex-1 truncate text-body-m-strong text-primary">
        <span aria-hidden>
          {fromName} → {toName}
        </span>
        <span className="sr-only">
          보내는 사람 {fromName}, 받는 사람 {toName}
        </span>
      </p>
      <span className="shrink-0 font-amount text-amount-s whitespace-nowrap text-amount-default">{formatKrw(amount)}</span>
      <IconButton
        size="s"
        icon="copy"
        label={copyLabel ?? `${formatKrw(amount)} 복사`}
        onClick={async () => {
          const text = String(Math.round(Math.abs(amount)))
          try {
            await navigator.clipboard?.writeText(text)
          } catch {
            // 권한이 없거나 http면 실패할 수 있다. 화면이 onCopyAmount에서 직접 처리한다.
          }
          onCopyAmount?.(text)
        }}
      />
    </div>
  )
}
