import { defineCatalog } from '../../catalog/catalog'
import { Row, Variant } from '../../catalog/ui'
import { Toggle } from './Toggle'

export default defineCatalog({
  title: 'Toggle',
  figma: '24:8839',
  group: 'components',
  order: 6,
  Demo: function ToggleCatalog() {
    return (
      <Row>
        <Variant name="Value=Off">
          <Toggle aria-label="알림" />
        </Variant>
        <Variant name="Value=On">
          <Toggle aria-label="알림" defaultValue />
        </Variant>
        <Variant name="Off · disabled">
          <Toggle aria-label="알림" disabled />
        </Variant>
        <Variant name="On · disabled">
          <Toggle aria-label="알림" defaultValue disabled />
        </Variant>
      </Row>
    )
  },
})
