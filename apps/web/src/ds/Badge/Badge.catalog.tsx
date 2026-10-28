import { defineCatalog } from '../../catalog/catalog'
import { Row, Variant } from '../../catalog/ui'
import { Badge, type BadgeSize, type BadgeStatus } from './Badge'

const STATUSES: BadgeStatus[] = ['upcoming', 'active', 'ended']
const SIZES: BadgeSize[] = ['m', 's']

export default defineCatalog({
  title: 'Badge',
  figma: '24:6998',
  group: 'components',
  order: 10,
  Demo: function BadgeCatalog() {
    return (
      <div className="flex flex-col gap-4">
        {SIZES.map((size) => (
          <Row key={size}>
            {STATUSES.map((status) => (
              <Variant key={status} name={`${status} · ${size}`}>
                <Badge status={status} size={size} />
              </Variant>
            ))}
            <Variant name="label">
              <Badge status="upcoming" size={size} label="D-3" />
            </Variant>
          </Row>
        ))}
      </div>
    )
  },
})
