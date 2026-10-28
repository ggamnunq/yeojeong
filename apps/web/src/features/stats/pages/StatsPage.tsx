import { useQuery, useQueryClient } from '@tanstack/react-query'
import { clsx } from 'clsx'
import { useEffect, useId } from 'react'
import { isApiError, keys, type BudgetState } from '../../../api'
import { useTripDetail } from '../../../app/trip'
import { formatKrw, RowMemberAmount } from '../../../ds'
import type { TripSummary } from '../../settlement/types'
import { CardsSkeleton, InlineError, SectionLabel, TabTitle } from '../../settlement/ui'
import { orderByMember, toPerson } from '../../settlement/view'
import { summaryQuery } from '../api'
import { budgetFillPercent, budgetUsedPercent, heroOf } from '../rules'

// WF-22 / HF-22 현황(진행 중). 보라 영웅 「내가 낼 금액」 하나 + 선 없는 블록 3개(공동 지출 · 내 지출 · 멤버별 부담).
// 시작 전 잠금·종료 후 정산 전환은 셸(tripTabs)이 맡는다. 예산 80% 배너는 두지 않는다(C-11).
export default function StatsPage() {
  const trip = useTripDetail()
  const queryClient = useQueryClient()
  const summary = useQuery(summaryQuery(trip.tripId))
  const phaseInvalid = isApiError(summary.error) && summary.error.status === 409

  // 여정 단계가 바뀌었다(409 TRIP_PHASE_INVALID): 여정을 다시 받아 셸이 맞는 탭으로 보내게 한다
  useEffect(() => {
    if (phaseInvalid) void queryClient.invalidateQueries({ queryKey: keys.trips.detail(trip.tripId), exact: true })
  }, [phaseInvalid, queryClient, trip.tripId])

  return (
    <>
      <TabTitle>현황</TabTitle>
      {summary.isPending ? (
        <CardsSkeleton blocks={2} rows={4} />
      ) : !summary.data ? (
        <InlineError onRetry={() => void summary.refetch()} />
      ) : (
        <StatsContent summary={summary.data} />
      )}
    </>
  )
}

function StatsContent({ summary }: { summary: TripSummary }) {
  const heroId = useId()
  const hero = heroOf(summary.me)
  return (
    <div className="flex flex-col px-gutter pb-8">
      {/* 영웅 카드 · 브랜드(direction §5): StatCard Brand에서 아이콘·sub를 빼고 숫자를 Amount/XL로 */}
      <section aria-labelledby={heroId} className="flex flex-col gap-1 rounded-xl bg-brand p-6">
        <h3 id={heroId} className="text-body-s-strong text-inverse">
          {hero.label}
        </h3>
        <p className="font-amount text-amount-xl whitespace-nowrap text-inverse">{formatKrw(hero.amount)}</p>
      </section>
      <SharedBudget summary={summary} />
      <MySpending spending={summary.mySpending} />
      <Burdens burdens={summary.burdens} />
    </div>
  )
}

const FILL = {
  NORMAL: 'bg-budget-fill',
  CAUTION: 'bg-budget-caution',
  OVER: 'bg-budget-over',
} satisfies Record<BudgetState, string>

/** 공동 지출 ₩352,790 / ₩1,200,000 + 막대(정상·주의·초과). 초과면 라벨 줄 오른쪽 빨강 글자 "초과 ₩84,500"(HF #48) */
function SharedBudget({ summary }: { summary: TripSummary }) {
  const id = useId()
  const { sharedTotalKrw: spent, budgetKrw: budget, budgetRatio: ratio, budgetState: state, overBudgetKrw: over } = summary
  const used = budgetUsedPercent(ratio)
  return (
    <section aria-labelledby={id} className="flex flex-col gap-2.5 pt-8">
      <div className="flex items-center justify-between gap-2">
        <SectionLabel id={id} level={3}>공동 지출</SectionLabel>
        {state === 'OVER' && over > 0 && <span className="text-caption whitespace-nowrap text-error">초과 {formatKrw(over)}</span>}
      </div>
      <p className="flex items-baseline gap-1.5 whitespace-nowrap">
        <span className="font-amount text-amount-m text-amount-default">{formatKrw(spent)}</span>
        {budget > 0 && <span className="text-body-s text-tertiary">/ {formatKrw(budget)}</span>}
      </p>
      {budget > 0 && (
        <div
          role="progressbar"
          aria-labelledby={id}
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={Math.min(100, used)}
          aria-valuetext={`${formatKrw(spent)} / ${formatKrw(budget)}, ${used}% 사용${over > 0 ? `, 초과 ${formatKrw(over)}` : ''}`}
          data-state={state.toLowerCase()}
          className="h-1.5 overflow-hidden rounded-full bg-budget-track"
        >
          <div className={clsx('h-full rounded-full', FILL[state])} style={{ width: `${budgetFillPercent(ratio, state)}%` }} />
        </div>
      )}
    </section>
  )
}

/** 내 지출 ₩174,190 + 2색 막대(공동·개인) + 범례. 내 지출이 0이면 막대 비움·범례 숨김(FR-603) */
function MySpending({ spending }: { spending: TripSummary['mySpending'] }) {
  const id = useId()
  const { totalKrw, sharedPct, personalPct } = spending
  return (
    <section aria-labelledby={id} className="flex flex-col gap-2.5 pt-7">
      <SectionLabel id={id} level={3}>내 지출</SectionLabel>
      <p className="font-amount text-amount-m whitespace-nowrap text-amount-default">{formatKrw(totalKrw)}</p>
      <div aria-hidden className="flex h-1.5 gap-0.5 overflow-hidden rounded-full bg-budget-track">
        {sharedPct !== null && sharedPct > 0 && (
          <div data-part="shared" className="h-full basis-0 rounded-full bg-expense-shared-solid" style={{ flexGrow: sharedPct }} />
        )}
        {personalPct !== null && personalPct > 0 && (
          <div data-part="personal" className="h-full basis-0 rounded-full bg-expense-personal-solid" style={{ flexGrow: personalPct }} />
        )}
      </div>
      {sharedPct !== null && personalPct !== null && (
        <ul className="flex items-center gap-4">
          <li className="flex items-center gap-1.5 text-caption text-secondary">
            <span aria-hidden className="size-1.5 rounded-full bg-expense-shared-solid" />
            공동 {sharedPct}%
          </li>
          <li className="flex items-center gap-1.5 text-caption text-secondary">
            <span aria-hidden className="size-1.5 rounded-full bg-expense-personal-solid" />
            개인 {personalPct}%
          </li>
        </ul>
      )}
    </section>
  )
}

/** 멤버별 부담(HF #61): 사람 + 금액 행. 나 먼저 → 가입 순, 나간 멤버는 흐린 프사 + 「나간 멤버」 */
function Burdens({ burdens }: { burdens: TripSummary['burdens'] }) {
  const id = useId()
  return (
    <section aria-labelledby={id} className="flex flex-col gap-0.5 pt-7">
      <SectionLabel id={id} level={3}>멤버별 부담</SectionLabel>
      <ul>
        {orderByMember(burdens).map((b) => (
          <li key={b.member.membershipId}>
            <RowMemberAmount person={toPerson(b.member)} amount={b.burdenKrw} />
          </li>
        ))}
      </ul>
    </section>
  )
}
