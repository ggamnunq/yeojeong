import { defineCatalog } from '../../catalog/catalog'
import { Row, Variant } from '../../catalog/ui'
import { DateHeader } from './DateHeader'

export default defineCatalog({
  title: 'DateHeader',
  figma: '58:10144',
  group: 'components',
  order: 24,
  Demo: function DateHeaderCatalog() {
    return (
      <Row>
        <Variant name='style="default" (띠 · 날짜 + n일차)' className="w-[390px]">
          <DateHeader date="10월 28일 (화)" day="2일차" className="w-full" />
        </Variant>
        <Variant name='style="default" · total' className="w-[390px]">
          <DateHeader date="10월 28일 (화)" day="2일차" total dailyTotal="₩184,200" className="w-full" />
        </Variant>
        <Variant name='style="plain" (v1.6 · HF-18 기본)' className="w-[390px]">
          <DateHeader style="plain" date="10월 28일 (화)" day="2일차" className="w-full bg-surface" />
        </Variant>
        <Variant name='style="plain" · total' className="w-[390px]">
          <DateHeader style="plain" date="10월 28일 (화)" day="2일차" total dailyTotal="₩184,200" className="w-full bg-surface" />
        </Variant>
      </Row>
    )
  },
})
