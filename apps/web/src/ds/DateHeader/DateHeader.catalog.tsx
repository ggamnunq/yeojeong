import { defineCatalog } from '../../catalog/catalog'
import { Sub } from '../../catalog/ui'
import { DateHeader } from './DateHeader'

export default defineCatalog({
  title: 'DateHeader',
  figma: '24:8264',
  group: 'components',
  order: 24,
  Demo: function DateHeaderCatalog() {
    return (
      <div className="flex flex-col gap-6">
        <Sub title="기본 (날짜 + n일차)">
          <div className="w-[390px]">
            <DateHeader date="10월 28일 (화)" day="2일차" />
          </div>
        </Sub>
        <Sub title="total (일자 합계)">
          <div className="w-[390px]">
            <DateHeader date="10월 28일 (화)" day="2일차" total dailyTotal="₩184,200" />
          </div>
        </Sub>
      </div>
    )
  },
})
