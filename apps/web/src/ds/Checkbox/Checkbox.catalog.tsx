import { defineCatalog } from '../../catalog/catalog'
import { Row, Variant } from '../../catalog/ui'
import { Checkbox } from './Checkbox'

const LABEL = '[필수] 서비스 이용약관 동의'

export default defineCatalog({
  title: 'Checkbox',
  figma: '24:8822',
  group: 'components',
  order: 5,
  Demo: function CheckboxCatalog() {
    return (
      <Row>
        <Variant name="Checked=Off">
          <Checkbox label={LABEL} />
        </Variant>
        <Variant name="Checked=On">
          <Checkbox label={LABEL} defaultChecked />
        </Variant>
        <Variant name="Off · disabled">
          <Checkbox label={LABEL} disabled />
        </Variant>
        <Variant name="On · disabled">
          <Checkbox label={LABEL} defaultChecked disabled />
        </Variant>
      </Row>
    )
  },
})
