import { clsx } from 'clsx'
import type { MouseEventHandler, ReactNode } from 'react'
import { Badge, type BadgeStatus } from '../Badge/Badge'
import { Icon } from '../Icon/Icon'
import type { IconName } from '../Icon/icons'
import { IconButton } from '../IconButton/IconButton'
import { Logo } from '../Logo/Logo'
import { focusRing } from '../styles'

// Figma TopHeader(24:7328) · Type=Group/Back/Logo × Status badge · Menu. 높이 56(layout/header-height), 아래 1px border/default.
export type TopHeaderType = 'group' | 'back' | 'logo'

type Click = MouseEventHandler<HTMLButtonElement>

export type TopHeaderGroupProps = {
  type?: 'group'
  /** Figma group name */
  groupName: ReactNode
  /** Figma Menu — 왼쪽 ≡(그룹 구성원 드로어). 기본 true */
  menu?: boolean
  /** Figma Status badge — 그룹명 옆 여정 상태 배지. 기본 false */
  statusBadge?: boolean
  /** 배지 상태(Figma 기본 Active) */
  status?: BadgeStatus
  onMenuClick?: Click
  /** 그룹명 + ⌄ → 그룹 목록 */
  onGroupClick?: Click
  onWalletClick?: Click
  onMyClick?: Click
}

export type TopHeaderBackProps = {
  type: 'back'
  /** Figma title */
  title: ReactNode
  onBack?: Click
  /** 오른쪽 action 버튼(Figma 기본 more). 없으면 그리지 않는다. */
  action?: { icon?: IconName; label: string; onClick?: Click }
}

export type TopHeaderLogoProps = {
  type: 'logo'
  onWalletClick?: Click
  onMyClick?: Click
}

export type TopHeaderProps = { className?: string } & (TopHeaderGroupProps | TopHeaderBackProps | TopHeaderLogoProps)

// Figma 좌우 패딩: Group 8/8 · Back 4/8 · Logo 20/8
const PADDING = { group: 'pl-2', back: 'pl-1', logo: 'pl-5' } satisfies Record<TopHeaderType, string>

export function TopHeader(props: TopHeaderProps) {
  return (
    <header
      className={clsx(
        'flex h-header-height shrink-0 items-center gap-1 border-b border-default bg-surface pr-2',
        PADDING[props.type ?? 'group'],
        props.className,
      )}
    >
      <Content {...props} />
    </header>
  )
}

function Content(props: TopHeaderProps) {
  if (props.type === 'back') {
    const { title, onBack, action } = props
    return (
      <>
        <IconButton size="m" icon="chevron-left" label="뒤로 가기" onClick={onBack} />
        <h1 className="min-w-0 truncate text-h3 text-primary">{title}</h1>
        <Spacer />
        {action && <IconButton size="m" icon={action.icon ?? 'more'} label={action.label} onClick={action.onClick} />}
      </>
    )
  }

  if (props.type === 'logo') {
    return (
      <>
        <h1 className="flex">
          <Logo height={28} />
        </h1>
        <Spacer />
        <WalletAndMy onWalletClick={props.onWalletClick} onMyClick={props.onMyClick} />
      </>
    )
  }

  const { groupName, menu = true, statusBadge = false, status = 'active', onMenuClick, onGroupClick } = props
  return (
    <>
      {menu && <IconButton size="m" icon="menu" label="그룹 구성원" aria-haspopup="dialog" onClick={onMenuClick} />}
      {/* Figma group switcher: 그룹명(H3) + ⌄ 20 (+ 배지), 간격 4. 누르는 높이만 44로 */}
      <div className="flex min-w-0 items-center gap-1">
        <h1 className="flex min-w-0">
          <button
            type="button"
            aria-haspopup="dialog"
            onClick={onGroupClick}
            className={clsx('flex h-touch-min min-w-0 items-center gap-1 rounded-sm text-primary select-none', focusRing)}
          >
            <span className="truncate text-h3">{groupName}</span>
            <Icon name="chevron-down" size={20} className="shrink-0 text-icon-default" />
          </button>
        </h1>
        {statusBadge && <Badge status={status} size="s" />}
      </div>
      <Spacer />
      <WalletAndMy onWalletClick={props.onWalletClick} onMyClick={props.onMyClick} />
    </>
  )
}

const Spacer = () => <div aria-hidden className="min-w-0 flex-1" />

function WalletAndMy({ onWalletClick, onMyClick }: { onWalletClick?: Click; onMyClick?: Click }) {
  return (
    <>
      <IconButton size="m" icon="wallet" label="지갑" onClick={onWalletClick} />
      <IconButton size="m" icon="user" label="마이페이지" onClick={onMyClick} />
    </>
  )
}
