import { defineCatalog } from '../../catalog/catalog'
import { Row, Variant } from '../../catalog/ui'
import { NavItem } from './NavItem'

export default defineCatalog({
  title: 'NavItem',
  figma: '24:7347',
  group: 'components',
  order: 51,
  Demo: function NavItemCatalog() {
    return (
      <Row>
        <Variant name='state="active"'>
          <div className="w-30 bg-surface">
            <NavItem state="active" label="결제내역" icon="receipt" />
          </div>
        </Variant>
        <Variant name='state="inactive"'>
          <div className="w-30 bg-surface">
            <NavItem state="inactive" label="결제내역" icon="receipt" />
          </div>
        </Variant>
        <Variant name="label · icon 교체">
          <div className="w-30 bg-surface">
            <NavItem label="정산" icon="coins" />
          </div>
        </Variant>
        <Variant name="href → 링크">
          <div className="w-30 bg-surface">
            <NavItem state="active" label="여정 정보" icon="info" href="#navitem" />
          </div>
        </Variant>
      </Row>
    )
  },
})
