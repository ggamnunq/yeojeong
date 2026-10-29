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
      <div className="flex flex-col gap-6">
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
        <Row>
          <Variant name="labelVisible={false} · Off">
            <Checkbox label={LABEL} labelVisible={false} />
          </Variant>
          <Variant name="labelVisible={false} · On">
            <Checkbox label={LABEL} labelVisible={false} defaultChecked />
          </Variant>
          <Variant name="labelVisible={false} · On · disabled">
            <Checkbox label={LABEL} labelVisible={false} defaultChecked disabled />
          </Variant>
        </Row>
      </div>
    )
  },
})
