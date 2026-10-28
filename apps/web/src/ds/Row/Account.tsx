import { clsx } from 'clsx'
import type { HTMLAttributes, MouseEventHandler, ReactNode } from 'react'
import { Icon } from '../Icon/Icon'
import { focusRing, touchTarget } from '../styles'

// Figma Row/Account(30:69508) · Type=Bank/Card + More(BOOLEAN). 지갑의 계좌·카드 행(전폭, 68).
// 원 아이콘(40, bg/subtle) + 이름 + 마스킹(끝 4자리) + more(···). 행 자체는 누르지 않고 more만 버튼이다.
export type RowAccountType = 'bank' | 'card'

export type RowAccountProps = Omit<HTMLAttributes<HTMLDivElement>, 'children'> & {
  type?: RowAccountType
  /** Figma name: "하나은행 입출금" */
  name: ReactNode
  /** Figma masked: "입출금 · 1102" (번호는 끝 4자리만) */
  masked: ReactNode
  /** Figma More: 오른쪽 ··· 버튼. 기본 true */
  more?: boolean
  onMoreClick?: MouseEventHandler<HTMLButtonElement>
  /** more 버튼의 접근성 이름. 계좌마다 구분되게 "하나은행 입출금 더 보기"처럼 준다 */
  moreLabel?: string
  children?: never
}

const ICON = { bank: 'bank', card: 'card' } as const satisfies Record<RowAccountType, string>

export function RowAccount({
  type = 'bank',
  name,
  masked,
  more = true,
  onMoreClick,
  moreLabel = '더 보기',
  className,
  ...rest
}: RowAccountProps) {
  return (
    <div className={clsx('flex w-full items-center gap-3 bg-surface px-5 py-3.5', className)} {...rest}>
      <span className="grid size-10 shrink-0 place-items-center rounded-full bg-subtle">
        <Icon name={ICON[type]} size={20} className="text-icon-default" />
      </span>
      <span className="flex min-w-0 flex-1 flex-col gap-0.5">
        <span className="truncate text-body-m-strong text-primary">{name}</span>
        <span className="truncate text-caption text-tertiary">{masked}</span>
      </span>
      {more && (
        <button
          type="button"
          aria-label={moreLabel}
          onClick={onMoreClick}
          className={clsx('shrink-0 rounded-full text-icon-subtle', touchTarget, focusRing)}
        >
          <Icon name="more" size={20} />
        </button>
      )}
    </div>
  )
}
