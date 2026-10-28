import { useState } from 'react'
import { defineCatalog } from '../../catalog/catalog'
import { PhoneFrame } from '../../catalog/PhoneFrame'
import { Row, Variant } from '../../catalog/ui'
import { ShellApp } from '../Shell/App'
import { DropdownMenu, DropdownMenuPanel, type DropdownMenuTrip } from './Menu'

const TRIPS: DropdownMenuTrip[] = [
  { title: '오사카 3박 4일', meta: '진행 중 · 4명', current: true },
  { title: '제주 2박 3일', meta: '시작 전 · 12.27' },
  { title: '부산 1박 2일', meta: '정산 완료' },
]
const ACTIONS = [{ label: '새 여정 만들기' }]

export default defineCatalog({
  title: 'Dropdown/Menu',
  figma: '30:69694',
  group: 'components',
  order: 86,
  Demo: function DropdownMenuCatalog() {
    const [open, setOpen] = useState(false)
    const [current, setCurrent] = useState(0)
    const trips = TRIPS.map((t, i) => ({ ...t, current: i === current, onSelect: () => setCurrent(i) }))
    return (
      <Row>
        <Variant name="Figma 기본(DropdownMenuPanel, 350 폭)">
          <div className="w-[350px]">
            <DropdownMenuPanel trips={TRIPS} actions={ACTIONS} />
          </div>
        </Variant>
        <Variant name="펼친 모습 고정 · TopHeader dropdown=open + 헤더 아래 딤">
          <PhoneFrame
            height={640}
            overlay={
              <div className="absolute inset-x-0 top-header-height bottom-0 bg-dim px-gutter">
                <DropdownMenuPanel trips={TRIPS} actions={ACTIONS} />
              </div>
            }
          >
            <ShellApp header={{ groupName: '오사카 3박 4일', dropdown: 'open' }} nav={{ 'aria-label': '여정 메뉴 예시 드롭다운 뒤' }}>
              <div />
            </ShellApp>
          </PhoneFrame>
        </Variant>
        <Variant name="실제 동작(DropdownMenu) — 그룹명 ⌄ · ↑↓ Home End · Enter · ESC · Tab">
          <PhoneFrame height={640}>
            <ShellApp
              header={{
                groupName: TRIPS[current].title,
                dropdown: open ? 'open' : 'closed',
                onGroupClick: () => setOpen(true),
              }}
              nav={{ 'aria-label': '여정 메뉴 예시 드롭다운 동작' }}
            >
              <p className="text-body-s text-secondary">그룹명을 누르면 여정 전환 메뉴가 열린다.</p>
            </ShellApp>
          </PhoneFrame>
          <DropdownMenu open={open} onClose={() => setOpen(false)} trips={trips} actions={ACTIONS} />
        </Variant>
      </Row>
    )
  },
})
