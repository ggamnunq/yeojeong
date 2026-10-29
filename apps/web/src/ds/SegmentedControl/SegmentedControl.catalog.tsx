import { defineCatalog } from '../../catalog/catalog'
import { Row, Sub, Variant } from '../../catalog/ui'
import { SegmentedControl } from './SegmentedControl'

export default defineCatalog({
  title: 'SegmentedControl',
  figma: '24:7040',
  group: 'components',
  order: 8,
  Demo: function SegmentedControlCatalog() {
    return (
      <div className="flex flex-col gap-8">
        <Sub title='size="m" (기본 · 높이 44 · FILL)'>
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
        </Sub>
        <Sub title='size="s" (v1.6 · 높이 32 · 폭 176/240 · Label/S)'>
          <Row>
            <Variant name="Count=2, Selected=First">
              <SegmentedControl size="s" labels={['리스트', '타임라인']} aria-label="보기 방식" />
            </Variant>
            <Variant name="Count=2, Selected=Second">
              <SegmentedControl size="s" labels={['리스트', '타임라인']} defaultSelected="second" aria-label="보기 방식" />
            </Variant>
            <Variant name="Count=3, Selected=First">
              <SegmentedControl size="s" labels={['전체', '공동', '개인']} aria-label="필터" />
            </Variant>
            <Variant name="Count=3, Selected=Second">
              <SegmentedControl size="s" labels={['전체', '공동', '개인']} defaultSelected="second" aria-label="필터" />
            </Variant>
            <Variant name="Count=3, Selected=Third">
              <SegmentedControl size="s" labels={['전체', '공동', '개인']} defaultSelected="third" aria-label="필터" />
            </Variant>
          </Row>
        </Sub>
        <Sub title="disabledItems (v1.6 Disabled 1~3 — 칸 흐림 · 선택 불가)">
          <Row>
            <Variant name="Disabled 2 · 결제 상세 [공동] 불가" className="w-[350px]">
              <SegmentedControl labels={['개인', '공동']} disabledItems={['second']} aria-label="결제 구분" />
            </Variant>
            <Variant name='size="s" · Disabled 2'>
              <SegmentedControl size="s" labels={['리스트', '타임라인']} disabledItems={['second']} aria-label="보기 방식" />
            </Variant>
            <Variant name='size="s" · Count=3 · Disabled 3'>
              <SegmentedControl size="s" labels={['전체', '공동', '개인']} disabledItems={['third']} aria-label="필터" />
            </Variant>
            <Variant name="disabled (전체)" className="w-[350px]">
              <SegmentedControl labels={['리스트', '타임라인']} disabled aria-label="보기 방식" />
            </Variant>
          </Row>
        </Sub>
      </div>
    )
  },
})
