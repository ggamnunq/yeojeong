import { defineCatalog } from '../../catalog/catalog'
import { Row, Variant } from '../../catalog/ui'
import { StatCard } from './StatCard'

export default defineCatalog({
  title: 'StatCard',
  figma: '24:8452',
  group: 'components',
  order: 26,
  Demo: function StatCardCatalog() {
    return (
      <div className="flex flex-col gap-6 rounded-lg bg-canvas p-4">
        <Row>
          <Variant name='type="default" · size="l" (350)'>
            <StatCard className="w-[350px]" label="총지출" amount={1284000} sub="공동 ₩1,026,000 · 내 개인 ₩258,000" />
          </Variant>
          <Variant name='size="m" (167)'>
            <StatCard className="w-[167px]" size="m" label="총지출" amount={1284000} sub="공동 ₩1,026,000 · 내 개인 ₩258,000" />
          </Variant>
        </Row>
        <Row>
          <Variant name='type="brand" · size="l"'>
            <StatCard className="w-[350px]" type="brand" label="내가 낼 금액" amount={48250} sub="정산 시 서준에게 보낼 예정" />
          </Variant>
          <Variant name='type="brand" · size="m"'>
            <StatCard className="w-[167px]" type="brand" size="m" label="내가 낼 금액" amount={48250} sub="정산 시 서준에게 보낼 예정" />
          </Variant>
        </Row>
      </div>
    )
  },
})
