import { clsx } from 'clsx'
import type { HTMLAttributes } from 'react'
import type { IconName } from '../Icon/icons'
import { NavItem } from '../NavItem/NavItem'

// Figma BottomNav(24:7446) · Tabs=3 × Active=First/Second/Third × Phase=Ongoing/Ended.
// 결제내역 / 현황(종료 후 = 정산) / 여정 정보. 높이 64(layout/nav-height) + 아래 안전영역, 위 1px border/default.
// Tabs=2는 Figma에서도 레거시라 만들지 않았다. 시작 전 잠긴 탭(locked)은 HF-13 시안의 덮어쓰기(자물쇠 아이콘 · 불투명 40%).
export type BottomNavActive = 'first' | 'second' | 'third'
export type BottomNavPhase = 'ongoing' | 'ended'

const ORDER: readonly BottomNavActive[] = ['first', 'second', 'third']

const TABS: Record<BottomNavPhase, readonly { label: string; icon: IconName }[]> = {
  ongoing: [
    { label: '결제내역', icon: 'receipt' },
    { label: '현황', icon: 'pie-chart' },
    { label: '여정 정보', icon: 'info' },
  ],
  ended: [
    { label: '결제내역', icon: 'receipt' },
    { label: '정산', icon: 'coins' },
    { label: '여정 정보', icon: 'info' },
  ],
}

export type BottomNavProps = Omit<HTMLAttributes<HTMLElement>, 'children' | 'onChange'> & {
  active?: BottomNavActive
  /** 여정 진행 중·시작 전 = ongoing, 종료 후 = ended(가운데 탭이 정산) */
  phase?: BottomNavPhase
  onChange?: (active: BottomNavActive) => void
  /** 탭을 링크로 그릴 때 각 탭의 주소 */
  hrefs?: readonly [string, string, string]
  /** 잠긴 탭(시작 전 = ['first', 'second']): 자물쇠 · 40% · 눌러도 onChange를 부르지 않는다 */
  locked?: readonly BottomNavActive[]
}

export function BottomNav({
  active = 'first',
  phase = 'ongoing',
  onChange,
  hrefs,
  locked = [],
  className,
  'aria-label': ariaLabel = '여정 메뉴',
  ...rest
}: BottomNavProps) {
  return (
    <nav
      aria-label={ariaLabel}
      className={clsx(
        // 구분선은 탭 위에 겹쳐 그려 높이를 정확히 64로 둔다(Figma inside stroke)
        'relative shrink-0 bg-surface pb-[env(safe-area-inset-bottom)] before:pointer-events-none before:absolute before:inset-x-0 before:top-0 before:h-px before:bg-border-default',
        className,
      )}
      {...rest}
    >
      <ul className="flex px-4">
        {TABS[phase].map((tab, index) => {
          const value = ORDER[index]
          return (
            <li key={value} className="min-w-0 flex-1">
              <NavItem
                state={value === active ? 'active' : 'inactive'}
                label={tab.label}
                icon={tab.icon}
                locked={locked.includes(value)}
                href={hrefs?.[index]}
                onClick={onChange && (() => onChange(value))}
              />
            </li>
          )
        })}
      </ul>
    </nav>
  )
}
