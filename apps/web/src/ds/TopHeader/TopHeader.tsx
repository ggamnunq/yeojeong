import { clsx } from 'clsx'
import type { MouseEventHandler, ReactNode } from 'react'
import { Badge, type BadgeStatus } from '../Badge/Badge'
import { Button } from '../Button/Button'
import { Icon } from '../Icon/Icon'
import type { IconName } from '../Icon/icons'
import { IconButton } from '../IconButton/IconButton'
import { Logo } from '../Logo/Logo'
import { focusRing } from '../styles'

// Figma TopHeader(24:7328) · Type=Group/Back/Logo/Close(v1.6) × Dropdown=Closed/Open(v1.4, Group만) × Status badge · Menu · Center title(v1.6).
// Close = 왼쪽 ✕(흐름 닫기 — 생성 완료 HF-11 등) + 가운데 제목(H3, 선택) + 오른쪽 40 균형 자리.
// Back(v1.7, 24:7296) = ‹ + Title visible · Title(H3) + Action · text action(Button Ghost S, 기본 "불러오기") — 오른쪽 끝 텍스트 액션.
// 높이 56(layout/header-height), 아래 1px border/default.
// divider · groupNameSize는 Figma 세트 속성이 아니라 Shell/App·Sub 인스턴스의 덮어쓰기(구분선 끔 · 그룹명 H2, spec 9-2 미승격 후보)다.
// 화면에서는 직접 쓰지 말고 Shell* 컴포넌트를 쓴다.
export type TopHeaderType = 'group' | 'back' | 'logo' | 'close'
export type TopHeaderDropdown = 'closed' | 'open'

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
  /** Figma Dropdown: open = 그룹 전환 드롭다운(DropdownMenu)이 펼쳐짐 → ⌃ + aria-expanded. 기본 closed */
  dropdown?: TopHeaderDropdown
  /** 그룹명 글자. Figma 세트 기본 h3, Shell/App 인스턴스는 h2 */
  groupNameSize?: 'h3' | 'h2'
  onMenuClick?: Click
  /** 그룹명 + ⌄ → 그룹 전환 드롭다운 */
  onGroupClick?: Click
  onWalletClick?: Click
  onMyClick?: Click
}

/** Figma Action + text action(v1.7): 오른쪽 끝 Button Ghost S */
export type TopHeaderTextAction = {
  /** Figma text action Label. 기본 "불러오기" */
  label?: ReactNode
  onClick?: Click
  disabled?: boolean
}

export type TopHeaderBackProps = {
  type: 'back'
  /** Figma Title + Title visible(v1.7): 넘기면 제목(H3)이 보인다. 없으면 ‹만(Figma 기본 off) */
  title?: ReactNode
  onBack?: Click
  /** 오른쪽 아이콘 action 버튼(Figma 기본 more). 없으면 그리지 않는다. */
  action?: { icon?: IconName; label: string; onClick?: Click }
  /** Figma Action(v1.7): 오른쪽 끝 텍스트 액션(Button Ghost S, 기본 "불러오기"). 객체를 주면 켜진다 */
  textAction?: TopHeaderTextAction
}

export type TopHeaderLogoProps = {
  type: 'logo'
  onWalletClick?: Click
  onMyClick?: Click
}

export type TopHeaderCloseProps = {
  type: 'close'
  /** Figma Center title + title: 넘기면 가운데 제목(H3)이 켜진다(Figma 기본 off) */
  title?: ReactNode
  onClose?: Click
  /** ✕의 접근성 이름. 기본 "닫기" */
  closeLabel?: string
}

export type TopHeaderProps = {
  /** 아래 1px 구분선. 기본 true, Shell 인스턴스는 false */
  divider?: boolean
  className?: string
} & (TopHeaderGroupProps | TopHeaderBackProps | TopHeaderLogoProps | TopHeaderCloseProps)

// Figma 좌우 패딩: Group 8/8 · Back 4/8 · Logo 20/8 · Close 4/8
const PADDING = { group: 'pl-2', back: 'pl-1', logo: 'pl-5', close: 'pl-1' } satisfies Record<TopHeaderType, string>

export function TopHeader(props: TopHeaderProps) {
  return (
    <header
      className={clsx(
        'flex h-header-height shrink-0 items-center gap-1 bg-surface pr-2',
        (props.divider ?? true) && 'border-b border-default',
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
    const { title, onBack, action, textAction } = props
    return (
      <>
        <IconButton size="m" icon="chevron-left" label="뒤로 가기" onClick={onBack} />
        {title != null && <h1 className="min-w-0 truncate text-h3 text-primary">{title}</h1>}
        <Spacer />
        {action && <IconButton size="m" icon={action.icon ?? 'more'} label={action.label} onClick={action.onClick} />}
        {textAction && (
          <Button
            type="ghost"
            size="s"
            label={textAction.label ?? '불러오기'}
            disabled={textAction.disabled}
            onClick={textAction.onClick}
          />
        )}
      </>
    )
  }

  if (props.type === 'close') {
    const { title, onClose, closeLabel = '닫기' } = props
    return (
      <>
        <IconButton size="m" icon="close" label={closeLabel} onClick={onClose} />
        {title != null ? (
          <h1 className="min-w-0 flex-1 truncate text-center text-h3 text-primary">{title}</h1>
        ) : (
          <Spacer />
        )}
        {/* Figma balance: 가운데 제목이 화면 가운데에 오도록 ✕와 같은 40 자리 */}
        <span aria-hidden className="size-10 shrink-0" />
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

  const {
    groupName,
    menu = true,
    statusBadge = false,
    status = 'active',
    dropdown = 'closed',
    groupNameSize = 'h3',
    onMenuClick,
    onGroupClick,
  } = props
  const open = dropdown === 'open'
  return (
    <>
      {menu && <IconButton size="m" icon="menu" label="그룹 구성원" aria-haspopup="dialog" onClick={onMenuClick} />}
      {/* Figma group switcher: 그룹명(H3 · 셸은 H2) + ⌄/⌃ 20 (+ 배지), 간격 4. 누르는 높이만 44로 */}
      <div className="flex min-w-0 items-center gap-1">
        <h1 className="flex min-w-0">
          <button
            type="button"
            aria-haspopup="menu"
            aria-expanded={open}
            onClick={onGroupClick}
            className={clsx('flex h-touch-min min-w-0 items-center gap-1 rounded-sm text-primary select-none', focusRing)}
          >
            <span className={clsx('truncate', groupNameSize === 'h2' ? 'text-h2' : 'text-h3')}>{groupName}</span>
            <Icon name={open ? 'chevron-up' : 'chevron-down'} size={20} className="shrink-0 text-icon-default" />
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
