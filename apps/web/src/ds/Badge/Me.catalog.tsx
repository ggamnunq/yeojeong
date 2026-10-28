import { defineCatalog } from '../../catalog/catalog'
import { Row, Variant } from '../../catalog/ui'
import { BadgeMe } from './Me'

export default defineCatalog({
  title: 'Badge/Me',
  figma: '24:61291',
  group: 'components',
  order: 73,
  Demo: function BadgeMeCatalog() {
    return (
      <Row>
        <Variant name="BadgeMe (bg/brand-subtle · text/brand · Label/S)">
          <BadgeMe />
        </Variant>
        <Variant name="이름 옆(간격 6)">
          <span className="flex items-center gap-1.5">
            <span className="text-body-m text-primary">준용</span>
            <BadgeMe />
          </span>
        </Variant>
      </Row>
    )
  },
})
