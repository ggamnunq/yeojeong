import { defineCatalog } from '../../catalog/catalog'
import { Row, Variant } from '../../catalog/ui'
import { IconButton, type IconButtonSize, type IconButtonType } from './IconButton'

const TYPES: IconButtonType[] = ['ghost', 'outline', 'filled']
const SIZES: IconButtonSize[] = ['l', 'm', 's']

export default defineCatalog({
  title: 'IconButton',
  figma: '24:6386',
  group: 'components',
  order: 2,
  Demo: function IconButtonCatalog() {
    return (
      <div className="flex flex-col gap-6">
        {TYPES.map((type) => (
          <Row key={type}>
            {SIZES.map((size) => (
              <Variant key={size} name={`${type} · ${size}`}>
                <IconButton type={type} size={size} icon="wallet" label="지갑" />
              </Variant>
            ))}
            {SIZES.map((size) => (
              <Variant key={size} name={`${type} · ${size} · disabled`}>
                <IconButton type={type} size={size} icon="wallet" label="지갑" disabled />
              </Variant>
            ))}
          </Row>
        ))}
      </div>
    )
  },
})
