import { defineCatalog } from '../../catalog/catalog'
import { Sub } from '../../catalog/ui'
import { RowAccount } from './Account'

export default defineCatalog({
  title: 'Row/Account',
  figma: '30:69508',
  group: 'components',
  order: 79,
  Demo: function RowAccountCatalog() {
    return (
      <div className="flex flex-col gap-8">
        <Sub title='type="bank" | "card" · more 기본 on (전폭 390)'>
          <div className="flex w-[390px] flex-col">
            <RowAccount name="하나은행 입출금" masked="입출금 · 1102" moreLabel="하나은행 입출금 더 보기" />
            <RowAccount type="card" name="신한카드 Deep Dream" masked="체크 · 1934" moreLabel="신한카드 Deep Dream 더 보기" />
          </div>
        </Sub>
        <Sub title="more={false}">
          <div className="w-[390px]">
            <RowAccount type="card" name="토스뱅크 체크카드" masked="체크 · 0428" more={false} />
          </div>
        </Sub>
      </div>
    )
  },
})
