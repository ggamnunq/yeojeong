import { defineCatalog } from '../../catalog/catalog'
import { Row, Variant } from '../../catalog/ui'
import { ProgressSteps } from './Steps'

export default defineCatalog({
  title: 'Progress/Steps',
  figma: '24:61316',
  group: 'components',
  order: 75,
  Demo: function ProgressStepsCatalog() {
    return (
      <Row>
        {([1, 2, 3, 4] as const).map((step) => (
          <Variant key={step} name={`step={${step}}`}>
            <ProgressSteps step={step} />
          </Variant>
        ))}
      </Row>
    )
  },
})
