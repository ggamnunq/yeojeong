import { defineCatalog } from '../../catalog/catalog'
import { Sub, Variant } from '../../catalog/ui'
import { RouteProgress } from './Progress'

export default defineCatalog({
  title: 'Route/Progress',
  figma: '24:61326',
  group: 'components',
  order: 76,
  Demo: function RouteProgressCatalog() {
    return (
      <div className="flex flex-col gap-8">
        <Sub title="phase (Figma: 4일 고정 · 진행 중 Day 2, 폭 310)">
          <div className="flex w-[350px] flex-col gap-6 rounded-lg border border-default bg-surface p-5">
            {(['upcoming', 'ongoing', 'ended'] as const).map((phase) => (
              <Variant key={phase} name={`phase="${phase}"`} className="[&>div]:block">
                <RouteProgress phase={phase} start="11.12 (목)" end="11.15 (일)" />
              </Variant>
            ))}
          </div>
        </Sub>
        <Sub title="코드 확장: days · current (Figma 세트에는 없음)">
          <div className="flex w-[350px] flex-col gap-6 rounded-lg border border-default bg-surface p-5">
            <Variant name="days={6} current={4}" className="[&>div]:block">
              <RouteProgress phase="ongoing" days={6} current={4} start="12.27 (토)" end="01.01 (목)" />
            </Variant>
            <Variant name="days={2} · 1박 2일 도착" className="[&>div]:block">
              <RouteProgress phase="ended" days={2} start="10.03 (금)" end="10.04 (토)" />
            </Variant>
          </div>
        </Sub>
        <Sub title="영웅 카드(톤) 안 — 06 패턴">
          <div className="flex w-[350px] flex-col rounded-xl bg-subtle px-5 pt-6 pb-5">
            <p className="text-body-s text-secondary">출발까지</p>
            <p className="mt-1 font-amount text-amount-xl text-primary">D-15</p>
            <p className="mt-1.5 text-body-s text-secondary">일본 오사카 · 4명</p>
            <RouteProgress className="mt-6" phase="upcoming" start="11.12 (목)" end="11.15 (일)" />
          </div>
        </Sub>
      </div>
    )
  },
})
