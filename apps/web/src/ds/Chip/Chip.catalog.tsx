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
