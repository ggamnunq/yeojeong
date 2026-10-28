import { useState } from 'react'
import { defineCatalog } from '../../catalog/catalog'
import { ME, MINJI, SUBIN, TAEHYUN } from '../../catalog/people'
import { PhoneFrame } from '../../catalog/PhoneFrame'
import { Row, Variant } from '../../catalog/ui'
import { RowAdd } from '../Row/Add'
import { RowMember } from '../Row/Member'
import { ShellApp } from '../Shell/App'
import { PanelSide, PanelSidePanel } from './Side'

function Members() {
  return (
    <>
      <RowMember person={ME} leader />
      <RowMember person={MINJI} kick={{}} />
      <RowMember person={TAEHYUN} kick={{}} />
      <RowMember person={SUBIN} kick={{}} />
      <RowAdd label="초대코드 공유" />
    </>
  )
}

export default defineCatalog({
  title: 'Panel/Side',
  figma: '30:69592',
  group: 'components',
  order: 85,
  Demo: function PanelSideCatalog() {
    const [open, setOpen] = useState(false)
    return (
      <Row>
        <Variant name="열린 모습 고정(PanelSidePanel) · 딤 위 · 300 × 화면 높이">
          <PhoneFrame
            overlay={
              <div className="absolute inset-0 bg-dim">
                <PanelSidePanel title="그룹원 4명">
                  <Members />
                </PanelSidePanel>
              </div>
            }
          >
            <ShellApp header={{ groupName: '오사카 3박 4일' }} nav={{ 'aria-label': '여정 메뉴 예시 패널 뒤' }}>
              <div />
            </ShellApp>
          </PhoneFrame>
        </Variant>
        <Variant name="실제 동작(PanelSide) — ≡를 눌러 열기 · ESC · 딤 · Tab 가두기">
          <PhoneFrame height={640}>
            <ShellApp
              header={{ groupName: '오사카 3박 4일', onMenuClick: () => setOpen(true) }}
              nav={{ 'aria-label': '여정 메뉴 예시 패널 동작' }}
            >
              <p className="text-body-s text-secondary">왼쪽 위 ≡를 누르면 그룹원 패널이 열린다.</p>
            </ShellApp>
          </PhoneFrame>
          <PanelSide open={open} onClose={() => setOpen(false)} title="그룹원 4명">
            <Members />
          </PanelSide>
        </Variant>
      </Row>
    )
  },
})
