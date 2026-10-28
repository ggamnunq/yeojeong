import { defineCatalog } from '../../catalog/catalog'
import { Row, Variant } from '../../catalog/ui'
import { AppIcon } from './AppIcon'
import { Logo } from './Logo'

export default defineCatalog({
  title: 'Logo',
  figma: '14:476 · 14:481 · 14:486 · 14:506',
  group: 'foundations',
  order: 5,
  Demo: function LogoCatalog() {
    return (
      <div className="flex flex-col gap-6">
        <Row>
          <Variant name='variant="primary" · height 96'>
            <div className="bg-surface p-4">
              <Logo height={96} />
            </div>
          </Variant>
          <Variant name='variant="inverse"'>
            <div className="bg-brand p-4">
              <Logo variant="inverse" height={96} />
            </div>
          </Variant>
          <Variant name='variant="mono"'>
            <div className="bg-surface p-4">
              <Logo variant="mono" height={96} />
            </div>
          </Variant>
        </Row>
        <Row className="items-end">
          {[20, 32, 48].map((h) => (
            <Variant key={h} name={`height={${h}}`}>
              <Logo height={h} />
            </Variant>
          ))}
          {[24, 48, 96, 180].map((s) => (
            <Variant key={s} name={`AppIcon size={${s}}`}>
              <AppIcon size={s} />
            </Variant>
          ))}
        </Row>
      </div>
    )
  },
})
