import { defineCatalog } from '../../catalog/catalog'
import { Row, Sub, Variant } from '../../catalog/ui'
import { ProgressSteps } from './Steps'

export default defineCatalog({
  title: 'Progress/Steps',
  figma: '24:61316',
  group: 'components',
  order: 75,
  Demo: function ProgressStepsCatalog() {
    return (
      <div className="flex flex-col gap-8">
        <Sub title="total={4} (기본 · 토스 연결 포함 가입)">
          <Row>
            {([1, 2, 3, 4] as const).map((step) => (
              <Variant key={step} name={`step={${step}}`}>
                <ProgressSteps step={step} />
              </Variant>
            ))}
          </Row>
        </Sub>
        <Sub title="total={3} (v1.6.3 Total=3)">
          <Row>
            {([1, 2, 3] as const).map((step) => (
              <Variant key={step} name={`step={${step}} total={3}`}>
                <ProgressSteps step={step} total={3} />
              </Variant>
            ))}
          </Row>
        </Sub>
        <Sub title="total={2} (DS18 · accountLink=false 가입: 닉네임 HF-03 · 약관 HF-04)">
          <Row>
            {([1, 2] as const).map((step) => (
              <Variant key={step} name={`step={${step}} total={2}`}>
                <ProgressSteps step={step} total={2} />
              </Variant>
            ))}
          </Row>
        </Sub>
      </div>
    )
  },
})
