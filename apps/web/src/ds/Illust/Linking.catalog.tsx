import { defineCatalog } from '../../catalog/catalog'
import { Row, Variant } from '../../catalog/ui'
import { IllustLinking } from './Illust'

export default defineCatalog({
  title: 'Illust/Linking',
  figma: '24:61424',
  group: 'components',
  order: 78,
  Demo: function IllustLinkingCatalog() {
    return (
      <Row className="rounded-lg border border-default bg-surface p-4">
        {(['before', 'pending', 'done'] as const).map((phase) => (
          <Variant key={phase} name={`phase="${phase}"`}>
            <IllustLinking phase={phase} />
          </Variant>
        ))}
      </Row>
    )
  },
})
