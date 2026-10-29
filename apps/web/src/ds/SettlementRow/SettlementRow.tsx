import { clsx } from 'clsx'
import type { ButtonHTMLAttributes, HTMLAttributes, ReactNode } from 'react'
import { Avatar } from '../Avatar/Avatar'
import type { AvatarPerson } from '../Avatar/rules'
import { BadgeMe } from '../Badge/Me'
import { formatKrw } from '../format'
import { Icon } from '../Icon/Icon'
import { focusRing } from '../styles'
import { Tag } from '../Tag/Tag'
import { formatSettlement, type SettlementRowNet } from './rules'

// Figma SettlementRow(24:8571) · Net=Receive/Send/Even × Member=Active/Left(v1.4) + Me + Tappable(v1.5)
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
  /** Figma Tappable. false면 비대화형 행이고 오른쪽 ›를 숨긴다. 기본 true */
  tappable?: boolean
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
  tappable = true,
  htmlType = 'button',
  className,
  ...rest
}: SettlementRowProps) {
  const s = formatSettlement(netAmount, net)
  const left = member === 'left'

  const content = (
    <>
      <Avatar {...person} me={me} left={left} size="m" alt="" />
      <span className="flex min-w-0 flex-1 flex-col gap-0.5">
        <span className="flex min-w-0 items-center gap-1.5">
          <span className="truncate text-body-m-strong text-primary">{name ?? person.name}</span>
          {me && <BadgeMe />}
          {left && <Tag type="left" size="s" />}
        </span>
        <span className="text-caption text-tertiary">결제 {formatKrw(paid)}</span>
        <span className="text-caption text-tertiary">부담 {formatKrw(share)}</span>
      </span>
      <span className={clsx('flex shrink-0 flex-col items-end', NET_COLOR[s.net])}>
        <span className="font-amount text-amount-m whitespace-nowrap">{s.amount}</span>
        <span className="text-caption">{s.label}</span>
      </span>
      {tappable && <Icon name="chevron-right" size={16} className="shrink-0 text-icon-subtle" />}
    </>
  )

  const rowClass = clsx('flex w-full items-center gap-3 bg-surface py-3.5 pr-4 pl-5 text-left', className)
  if (!tappable) {
    // 비대화형 행도 aria-label·data-*·id·style 등은 그대로 받는다(DS17). 버튼에만 뜻이 있는 속성은 버린다
    const {
      disabled: _disabled,
      form: _form,
      formAction: _formAction,
      formEncType: _formEncType,
      formMethod: _formMethod,
      formNoValidate: _formNoValidate,
      formTarget: _formTarget,
      value: _value,
      ...divProps
    } = rest
    return (
      <div className={rowClass} {...(divProps as unknown as HTMLAttributes<HTMLDivElement>)}>
        {content}
      </div>
    )
  }

  return (
    <button type={htmlType} className={clsx(rowClass, 'transition-colors select-none enabled:active:bg-pressed', focusRing)} {...rest}>
      {content}
    </button>
  )
}
