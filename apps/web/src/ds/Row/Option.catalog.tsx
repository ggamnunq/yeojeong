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
      <Sub title="selected · title · subtitle · icon (350 폭)">
        <div className="flex w-[350px] flex-col gap-1 bg-surface">
          <RowOption name="row-option-demo" title="토스로 불러오기" subtitle="은행·카드를 한 번에 연결" selected readOnly />
          <RowOption name="row-option-demo" title="토스로 불러오기" subtitle="은행·카드를 한 번에 연결" selected={false} readOnly />
          <RowOption name="row-option-demo-2" icon="card" title="직접 추가" subtitle="카드사 앱 내역을 붙여넣기" disabled />
        </div>
      </Sub>
    )
  },
})
