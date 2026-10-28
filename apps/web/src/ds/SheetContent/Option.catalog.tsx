import { useState } from 'react'
import { defineCatalog } from '../../catalog/catalog'
import { Sub } from '../../catalog/ui'
import { BottomSheetPanel } from '../BottomSheet/BottomSheet'
import { SheetContentOption, type SheetContentOptionItem } from './Option'

const OPTIONS: SheetContentOptionItem[] = [
  { value: 'toss', title: '토스로 불러오기', subtitle: '은행·카드를 한 번에 연결' },
  { value: 'manual', icon: 'card', title: '직접 추가', subtitle: '카드사 앱 내역을 붙여넣기' },
]

export default defineCatalog({
  title: 'SheetContent/Option',
  figma: '30:69546',
  group: 'components',
  order: 82,
  Demo: function SheetContentOptionCatalog() {
    const [value, setValue] = useState('toss')
    return (
      <div className="flex flex-col gap-8">
        <Sub title="옵션 2개(Option 2 on) · 화살표 키로 선택">
          <div className="w-[350px]">
            <SheetContentOption aria-label="추가 방법" options={OPTIONS} value={value} onChange={setValue} />
          </div>
        </Sub>
        <Sub title="옵션 1개(Option 2 off) · BottomSheet Content 슬롯(HF-28)">
          <div className="w-[390px]">
            <BottomSheetPanel title="계좌·카드 추가" cta={{ label: '토스로 연결' }}>
              <SheetContentOption aria-label="추가 방법" options={OPTIONS.slice(0, 1)} value="toss" />
            </BottomSheetPanel>
          </div>
        </Sub>
      </div>
    )
  },
})
