import { useState } from 'react'
import { defineCatalog } from '../../catalog/catalog'
import { Sub, Variant } from '../../catalog/ui'
import { BottomNav, type BottomNavActive, type BottomNavPhase } from './BottomNav'

const ACTIVES: BottomNavActive[] = ['first', 'second', 'third']
const PHASES: BottomNavPhase[] = ['ongoing', 'ended']

export default defineCatalog({
  title: 'BottomNav',
  figma: '24:7446',
  group: 'components',
  order: 52,
  Demo: function BottomNavCatalog() {
    const [active, setActive] = useState<BottomNavActive>('first')
    return (
      <div className="flex flex-col gap-8">
        {PHASES.map((phase) => (
          <Sub key={phase} title={`phase="${phase}"${phase === 'ended' ? ' · 가운데 탭 = 정산' : ''}`}>
            <div className="flex flex-wrap gap-6">
              {ACTIVES.map((a) => (
                <Variant key={a} name={`active="${a}"`}>
                  <div className="w-[390px]">
                    <BottomNav phase={phase} active={a} aria-label={`여정 메뉴 예시 ${phase} ${a}`} />
                  </div>
                </Variant>
              ))}
            </div>
          </Sub>
        ))}
        <Sub title="눌러서 바꾸기 (onChange)">
          <div className="w-[390px]">
            <BottomNav active={active} onChange={setActive} aria-label="여정 메뉴 예시 동작" />
          </div>
        </Sub>
      </div>
    )
  },
})
