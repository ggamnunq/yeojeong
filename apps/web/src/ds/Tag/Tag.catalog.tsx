import { defineCatalog } from '../../catalog/catalog'
import { Row, Variant } from '../../catalog/ui'
import { Tag, type TagSize, type TagType } from './Tag'

const TYPES: TagType[] = ['shared', 'personal', 'pending', 'duplicate', 'refund', 'left']
const SIZES: TagSize[] = ['m', 's']

export default defineCatalog({
  title: 'Tag',
  figma: '24:7086',
  group: 'components',
  order: 9,
  Demo: function TagCatalog() {
    return (
      <div className="flex flex-col gap-4">
        {SIZES.map((size) => (
          <Row key={size}>
            {TYPES.map((type) => (
              <Variant key={type} name={`${type} · ${size}`}>
                <Tag type={type} size={size} />
              </Variant>
            ))}
          </Row>
        ))}
      </div>
    )
  },
})
