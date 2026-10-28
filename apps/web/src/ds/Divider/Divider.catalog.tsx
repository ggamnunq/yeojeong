import { defineCatalog } from '../../catalog/catalog'
import { Variant } from '../../catalog/ui'
import { Divider } from './Divider'

export default defineCatalog({
  title: 'Divider',
  figma: '24:8796',
  group: 'components',
  order: 11,
  Demo: function DividerCatalog() {
    return (
      <div className="flex flex-col gap-4">
        {(['full', 'inset', 'thick'] as const).map((type) => (
          <Variant key={type} name={`type="${type}"`} className="w-[390px]">
            <div className="w-full bg-surface py-3">
              <Divider type={type} />
            </div>
          </Variant>
        ))}
      </div>
    )
  },
})
