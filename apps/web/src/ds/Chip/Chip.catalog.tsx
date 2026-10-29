import { defineCatalog } from '../../catalog/catalog'
import { Row, Variant } from '../../catalog/ui'
import { Chip } from './Chip'

export default defineCatalog({
  title: 'Chip',
  figma: '24:7111',
  group: 'components',
  order: 7,
  Demo: function ChipCatalog() {
    return (
      <Row>
        <Variant name="State=Default">
          <Chip label="민지" />
        </Variant>
        <Variant name="State=Selected">
          <Chip label="민지" defaultSelected />
        </Variant>
        <Variant name="State=Disabled">
          <Chip label="민지" disabled />
        </Variant>
        <Variant name="Style=Tone · State=Default">
          <Chip style="tone" label="Day 1" />
        </Variant>
        <Variant name="Style=Tone · State=Selected">
          <Chip style="tone" label="확인 필요 2건" defaultSelected />
        </Variant>
        <Variant name="Removable · State=Default">
          <Chip removable label="확인 필요 2건" />
        </Variant>
        <Variant name="Removable · State=Selected (필터 해제)">
          <Chip removable label="확인 필요 2건" aria-label="확인 필요 2건, 미확정만 보기 해제" defaultSelected />
        </Variant>
        <Variant name="Removable · Style=Tone · Selected">
          <Chip removable style="tone" label="Day 2" defaultSelected />
        </Variant>
        <Variant name="Removable · State=Disabled">
          <Chip removable label="확인 필요 2건" disabled />
        </Variant>
        <Variant name="눌러서 선택">
          <div className="flex gap-2">
            {['준용', '민지', '서준', '태현'].map((n) => (
              <Chip key={n} label={n} />
            ))}
          </div>
        </Variant>
      </Row>
    )
  },
})
