import { defineCatalog } from '../../catalog/catalog'
import { Row, Variant } from '../../catalog/ui'
import { MetricBar } from './MetricBar'

export default defineCatalog({
  title: 'MetricBar',
  figma: '52:10206',
  group: 'components',
  order: 27,
  Demo: function MetricBarCatalog() {
    return (
      <div className="flex flex-col gap-8">
        <Row className="gap-8">
          <Variant name='type="single" · total (Figma 기본)' className="w-[350px]">
            <MetricBar label="공동 지출" amount={352790} total={1200000} />
          </Variant>
          <Variant name='type="split"' className="w-[350px]">
            <MetricBar type="split" label="내 지출" amount={174190} shared={54} personal={46} />
          </Variant>
        </Row>
        <Row className="gap-8">
          <Variant name="single · 주의(80% 이상)" className="w-[350px]">
            <MetricBar label="공동 지출" amount={1010000} total={1200000} />
          </Variant>
          <Variant name="single · 초과(라벨 줄 오른쪽 초과 금액)" className="w-[350px]">
            <MetricBar label="공동 지출" amount={1284500} total={1200000} />
          </Variant>
          <Variant name="single · total 없음(예산 없음 → 막대 없음)" className="w-[350px]">
            <MetricBar label="공동 지출" amount={352790} />
          </Variant>
        </Row>
        <Row className="gap-8">
          <Variant name="split · 공동만(100 / 0)" className="w-[350px]">
            <MetricBar type="split" label="내 지출" amount={88000} shared={100} personal={0} />
          </Variant>
          <Variant name="split · 내 지출 0(null → 빈 막대 · 범례 없음)" className="w-[350px]">
            <MetricBar type="split" label="내 지출" amount={0} shared={null} personal={null} />
          </Variant>
        </Row>
      </div>
    )
  },
})
