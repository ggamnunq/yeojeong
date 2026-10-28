import { defineCatalog } from '../../catalog/catalog'
import { Sub, Variant } from '../../catalog/ui'
import { BudgetProgress } from './BudgetProgress'

export default defineCatalog({
  title: 'BudgetProgress',
  figma: '24:8517',
  group: 'components',
  order: 27,
  Demo: function BudgetProgressCatalog() {
    return (
      <div className="flex flex-col gap-6">
        <Sub title="state는 spent / budget 비율로 자동 (폭 350)">
          <div className="flex w-[350px] flex-col gap-4">
            <Variant name="55% → normal" className="w-full">
              <BudgetProgress className="w-full" spent={825000} budget={1500000} />
            </Variant>
            <Variant name="86% → caution" className="w-full">
              <BudgetProgress className="w-full" spent={1284000} budget={1500000} />
            </Variant>
            <Variant name="107% → over" className="w-full">
              <BudgetProgress className="w-full" spent={1612000} budget={1500000} />
            </Variant>
            <Variant name='40%인데 state="caution"으로 덮어씀' className="w-full">
              <BudgetProgress className="w-full" spent={600000} budget={1500000} state="caution" />
            </Variant>
          </div>
        </Sub>
      </div>
    )
  },
})
