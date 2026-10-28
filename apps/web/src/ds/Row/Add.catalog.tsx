import { defineCatalog } from '../../catalog/catalog'
import { Sub } from '../../catalog/ui'
import { RowAdd } from './Add'

export default defineCatalog({
  title: 'Row/Add',
  figma: '30:69511',
  group: 'components',
  order: 80,
  Demo: function RowAddCatalog() {
    return (
      <Sub title="label: 계좌·카드 추가(지갑) · 초대코드 공유(그룹원 패널) · 새 여정 만들기(드롭다운)">
        <div className="flex w-[390px] flex-col">
          <RowAdd label="계좌·카드 추가" />
          <RowAdd label="초대코드 공유" />
          <RowAdd label="새 여정 만들기" />
        </div>
      </Sub>
    )
  },
})
