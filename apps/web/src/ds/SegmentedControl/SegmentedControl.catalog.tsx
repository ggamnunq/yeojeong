import { defineCatalog } from '../../catalog/catalog'
import { Row, Variant } from '../../catalog/ui'
import { SegmentedControl } from './SegmentedControl'

export default defineCatalog({
  title: 'SegmentedControl',
  figma: '24:7040',
  group: 'components',
  order: 8,
  Demo: function SegmentedControlCatalog() {
    return (
      <Row>
        <Variant name="Count=2, Selected=First" className="w-[350px]">
          <SegmentedControl labels={['리스트', '타임라인']} aria-label="보기 방식" />
        </Variant>
        <Variant name="Count=2, Selected=Second" className="w-[350px]">
          <SegmentedControl labels={['리스트', '타임라인']} defaultSelected="second" aria-label="보기 방식" />
        </Variant>
        <Variant name="Count=3, Selected=First" className="w-[350px]">
          <SegmentedControl labels={['전체', '공동', '개인']} aria-label="필터" />
        </Variant>
        <Variant name="Count=3, Selected=Second" className="w-[350px]">
          <SegmentedControl labels={['전체', '공동', '개인']} defaultSelected="second" aria-label="필터" />
        </Variant>
        <Variant name="Count=3, Selected=Third" className="w-[350px]">
          <SegmentedControl labels={['전체', '공동', '개인']} defaultSelected="third" aria-label="필터" />
        </Variant>
      </Row>
    )
  },
})
