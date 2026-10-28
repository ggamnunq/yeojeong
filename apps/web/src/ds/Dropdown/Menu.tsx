import { clsx } from 'clsx'
import type { KeyboardEvent, ReactNode } from 'react'
import { ListItem } from '../ListItem/ListItem'
import { RowAdd } from '../Row/Add'
import { useModalDialog } from '../useModalDialog'

// Figma Dropdown/Menu(30:69694) · 그룹 전환 드롭다운(TopHeader Dropdown=Open 아래).
// 흰 패널 radius/lg(16) · Elevation/2 · 위아래 8: 여정 행(ListItem + airplane, 현재 = Selected 체크 · 나머지 = Navigation, 상태는 메타 글자)
// + 맨 아래 Row/Add("새 여정 만들기"). 딤(bg/dim)은 헤더 아래부터 깔고 헤더는 딤 밖에 둔다(WF-14).
// 키보드: role=menu, ↑↓ · Home · End로 항목 이동, Enter·Space로 선택, ESC·Tab·딤·헤더 탭으로 닫힘.
export type DropdownMenuTrip = {
  /** React key. 없으면 순서 */
  key?: string
  /** 여정 이름 — ListItem title */
  title: ReactNode
  /** 상태 메타 글자: "진행 중" · "시작 전 · 12.27" · "정산 완료"(배지 대신) — ListItem subtitle */
  meta?: ReactNode
  /** 지금 보고 있는 여정(ListItem Selected) */
  current?: boolean
  onSelect?: () => void
}

export type DropdownMenuAction = {
  /** Row/Add Label: "새 여정 만들기" */
  label: ReactNode
  onSelect?: () => void
}

export type DropdownMenuPanelProps = {
  trips: readonly DropdownMenuTrip[]
  /** 목록 끝 Row/Add 행들(Figma는 "새 여정 만들기" 하나) */
  actions?: readonly DropdownMenuAction[]
  /** 항목을 고른 뒤·Tab으로 빠져나갈 때 부른다 */
  onClose?: () => void
  'aria-label'?: string
  className?: string
}

const ITEM = '[role^="menuitem"]:not([disabled])'

function moveFocus(event: KeyboardEvent<HTMLDivElement>) {
  const items = Array.from(event.currentTarget.querySelectorAll<HTMLElement>(ITEM))
  if (items.length === 0) return false
  const index = items.indexOf(document.activeElement as HTMLElement)
  const next = {
    ArrowDown: index < 0 ? 0 : (index + 1) % items.length,
    ArrowUp: index < 0 ? items.length - 1 : (index - 1 + items.length) % items.length,
    Home: 0,
    End: items.length - 1,
  }[event.key]
  if (next === undefined) return false
  items[next].focus()
  return true
}

/** 드롭다운의 겉모습 + 메뉴 키보드 동작(모달 동작 없음). DropdownMenu 안에서 쓰고, 카탈로그에서 펼친 모습을 고정해 보여 줄 때 쓴다. */
export function DropdownMenuPanel({
  trips,
  actions = [],
  onClose,
  'aria-label': ariaLabel = '여정 전환',
  className,
}: DropdownMenuPanelProps) {
  // 처음 포커스를 받을 항목(현재 여정, 없으면 첫 항목)만 tabIndex 0. 나머지는 화살표로 옮긴다.
  const home = Math.max(
    0,
    trips.findIndex((t) => t.current),
  )
  const select = (onSelect?: () => void) => () => {
    onClose?.()
    onSelect?.()
  }

  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.key === 'Tab') {
      // 메뉴는 Tab으로 항목을 돌지 않는다 — 닫고 포커스를 여는 버튼으로 돌려준다
      event.preventDefault()
      event.stopPropagation()
      onClose?.()
      return
    }
    if (moveFocus(event)) event.preventDefault()
  }

  return (
    <div
      role="menu"
      aria-label={ariaLabel}
      onKeyDown={onKeyDown}
      className={clsx(
        'flex max-h-[60dvh] w-full flex-col overflow-y-auto rounded-lg bg-surface py-2 shadow-elevation-2',
        className,
      )}
    >
      {trips.map((trip, i) => (
        <ListItem
          key={trip.key ?? i}
          role="menuitemradio"
          aria-checked={!!trip.current}
          tabIndex={i === home ? 0 : -1}
          type={trip.current ? 'selected' : 'navigation'}
          leadingIcon="airplane"
          title={trip.title}
          subtitle={trip.meta}
          onClick={select(trip.onSelect)}
          className="min-h-14"
        />
      ))}
      {actions.map((action, i) => (
        <RowAdd
          key={i}
          role="menuitem"
          tabIndex={trips.length === 0 && i === 0 ? 0 : -1}
          label={action.label}
          onClick={select(action.onSelect)}
        />
      ))}
    </div>
  )
}

export type DropdownMenuProps = Omit<DropdownMenuPanelProps, 'onClose' | 'className'> & {
  open: boolean
  /** ESC · Tab · 딤 · 헤더(▴) 탭 · 항목 선택 · 뒤로 가기(닫기 요청) */
  onClose: () => void
}

export function DropdownMenu({ open, onClose, 'aria-label': ariaLabel = '여정 전환', ...panel }: DropdownMenuProps) {
  const { dialogProps, requestClose } = useModalDialog(open, onClose)
  // 헤더 높이 + 위 안전영역. 딤과 패널은 그 아래에서 시작한다.
  const below = 'top-[calc(var(--spacing-header-height)+env(safe-area-inset-top))]'

  return (
    <dialog
      {...dialogProps}
      aria-label={ariaLabel}
      className={clsx(
        'group/menu fixed inset-0 m-0 size-full max-h-none max-w-none overflow-hidden bg-transparent p-0 text-primary backdrop:bg-transparent',
        'transition-[display,overlay] transition-discrete duration-150 motion-reduce:transition-none',
      )}
    >
      {/* 헤더 자리는 투명하게 두고(헤더가 그대로 보인다) 어디를 눌러도 닫는다 — ▴를 다시 누르는 동작 */}
      <div aria-hidden onClick={requestClose} className="absolute inset-0" />
      <div
        data-dim=""
        aria-hidden
        className={clsx(
          'pointer-events-none absolute inset-x-0 bottom-0 bg-dim opacity-0 transition-opacity duration-150 group-open/menu:opacity-100 motion-reduce:transition-none starting:group-open/menu:opacity-0',
          below,
        )}
      />
      <div
        className={clsx(
          'pointer-events-none absolute inset-x-0 mx-auto w-full max-w-screen-width px-gutter',
          below,
        )}
      >
        <div className="pointer-events-auto -translate-y-1 opacity-0 transition-[opacity,translate] duration-150 ease-out group-open/menu:translate-y-0 group-open/menu:opacity-100 motion-reduce:transition-none starting:group-open/menu:-translate-y-1 starting:group-open/menu:opacity-0">
          <DropdownMenuPanel {...panel} aria-label={ariaLabel} onClose={requestClose} />
        </div>
      </div>
    </dialog>
  )
}
