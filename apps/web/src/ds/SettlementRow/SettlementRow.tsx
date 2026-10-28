import { clsx } from 'clsx'
import type { ButtonHTMLAttributes, ReactNode } from 'react'
import { Avatar } from '../Avatar/Avatar'
import type { AvatarPerson } from '../Avatar/rules'
import { formatKrw } from '../format'
import { Icon } from '../Icon/Icon'
import { focusRing } from '../styles'
import { Tag } from '../Tag/Tag'
import { formatSettlement, type SettlementRowNet } from './rules'

// Figma SettlementRow(24:8571) · Net=Receive/Send/Even × Member=Active/Left(v1.4) + Me
// 정산 요약의 사람별 행(누르면 그 사람의 결제 내역). Net은 순잔액(paid − share) 부호로 정해지고 net prop으로 덮어쓸 수 있다.
export type SettlementRowMember = 'active' | 'left'

export type SettlementRowProps = Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'type' | 'children'> & {
  /** Figma avatar(Avatar M) + name */
  person: AvatarPerson
  /** 결제합(원) — Figma paid "결제 ₩482,000" */
  paid: number
  /** 부담액(원) — Figma share "부담 ₩321,000" */
  share: number
  /** 순잔액(원). 기본 paid − share */
  netAmount?: number
  /** Figma Net. 생략하면 순잔액 부호로 */
  net?: SettlementRowNet
  /** Figma Member: left = 프사 Left + 이름 옆 "나간 멤버" 태그. 기본 person.left */
  member?: SettlementRowMember
  /** Figma Me: 이름 옆 "나" 배지 + 프사 보라 테두리. 기본 person.me */
  me?: boolean
  /** 이름 표기를 바꿀 때. 기본 person.name */
  name?: ReactNode
  htmlType?: 'button' | 'submit' | 'reset'
  children?: never
}

const NET_COLOR = {
  receive: 'text-amount-receive',
  send: 'text-amount-send',
  even: 'text-tertiary',
} satisfies Record<SettlementRowNet, string>

export function SettlementRow({
  person,
  paid,
  share,
  netAmount = paid - share,
  net,
  member = person.left ? 'left' : 'active',
  me = person.me ?? false,
  name,
  htmlType = 'button',
  className,
  ...rest
}: SettlementRowProps) {
  const s = formatSettlement(netAmount, net)
  const left = member === 'left'

  return (
    <button
      type={htmlType}
      className={clsx(
        'flex w-full items-center gap-3 bg-surface py-3.5 pr-4 pl-5 text-left transition-colors select-none enabled:active:bg-pressed',
        focusRing,
        className,
      )}
      {...rest}
    >
      <Avatar {...person} me={me} left={left} size="m" alt="" />
      <span className="flex min-w-0 flex-1 flex-col gap-0.5">
        <span className="flex min-w-0 items-center gap-1.5">
          <span className="truncate text-body-m-strong text-primary">{name ?? person.name}</span>
          {/* Figma Badge/Me와 같은 모양 */}
          {me && <span className="shrink-0 rounded-xs bg-brand-subtle px-1.5 py-px text-label-s text-brand">나</span>}
          {left && <Tag type="left" size="s" />}
        </span>
        <span className="text-caption text-tertiary">결제 {formatKrw(paid)}</span>
        <span className="text-caption text-tertiary">부담 {formatKrw(share)}</span>
      </span>
      <span className={clsx('flex shrink-0 flex-col items-end', NET_COLOR[s.net])}>
        <span className="font-amount text-amount-m whitespace-nowrap">{s.amount}</span>
        <span className="text-caption">{s.label}</span>
      </span>
      <Icon name="chevron-right" size={20} className="shrink-0 text-icon-subtle" />
    </button>
  )
}
