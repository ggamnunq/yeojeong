import { defineCatalog } from '../../catalog/catalog'
import { Sub } from '../../catalog/ui'
import { RowOption } from './Option'

export default defineCatalog({
  title: 'Row/Option',
  figma: '30:69543',
  group: 'components',
  order: 81,
  Demo: function RowOptionCatalog() {
    return (
      <div className="flex flex-col gap-8">
        <Sub title="selected · title · subtitle · icon (350 폭)">
          <div className="flex w-[350px] flex-col gap-1 bg-surface">
            <RowOption name="row-option-demo" title="토스로 불러오기" subtitle="은행·카드를 한 번에 연결" selected readOnly />
            <RowOption name="row-option-demo" title="토스로 불러오기" subtitle="은행·카드를 한 번에 연결" selected={false} readOnly />
            <RowOption name="row-option-demo-2" icon="card" title="직접 추가" subtitle="카드사 앱 내역을 붙여넣기" disabled />
          </div>
        </Sub>
        <Sub title="logo={false} (v1.6.3 · HF-48b 여정 선택) · subtitle 생략 = Subtitle off (높이 46)">
          <div className="flex w-[350px] flex-col bg-surface">
            <RowOption name="row-option-trip" logo={false} title="오사카 3박 4일" subtitle="진행 중 · 11.12 – 11.15" selected readOnly />
            <RowOption name="row-option-trip" logo={false} title="부산 연말 모임" subtitle="시작 전 · 12.27 – 12.29" selected={false} readOnly />
            <RowOption name="row-option-trip" logo={false} title="추가 안 함" selected={false} readOnly />
          </div>
        </Sub>
      </div>
    )
  },
})
