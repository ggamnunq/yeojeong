import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useEffect, useId } from 'react'
import { isApiError, keys, type BudgetState } from '../../../api'
import { useTripDetail } from '../../../app/trip'
import { MetricBar, RowMemberAmount, StatCard, type BudgetProgressState } from '../../../ds'
import type { TripSummary } from '../../settlement/types'
import { CardsSkeleton, InlineError, SectionLabel, TabTitle } from '../../settlement/ui'
import { orderByMember, toPerson } from '../../settlement/view'
import { summaryQuery } from '../api'
import { heroOf } from '../rules'

// WF-22 / HF-22 현황(진행 중). StatCard Hero 「내가 낼 금액」 → MetricBar Single(공동 지출) → Split(내 지출) → 멤버별 부담.
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
  const hero = heroOf(summary.me)
  const { sharedPct, personalPct } = summary.mySpending
  return (
    <div className="flex flex-col px-gutter pb-8">
      <StatCard type="hero" size="l" label={hero.label} amount={hero.amount} role="region" aria-label={hero.label} />
      {/* 공동 지출 / 예산(예산 0원이면 총액·막대 없음) · 초과면 라벨 줄 오른쪽 "초과 ₩"(HF #48) */}
      <MetricBar
        className="pt-8"
        headingLevel={3}
        label="공동 지출"
        amount={summary.sharedTotalKrw}
        total={summary.budgetKrw}
        state={BUDGET_STATE[summary.budgetState]}
      />
      {/* 내 지출: 공동·개인 2분할 + 범례. 내 지출이 0이면 빈 막대·범례 없음(FR-603) */}
      <MetricBar
        className="pt-7"
        headingLevel={3}
        type="split"
        label="내 지출"
        amount={summary.mySpending.totalKrw}
        shared={sharedPct}
        personal={personalPct}
      />
      <Burdens burdens={summary.burdens} />
    </div>
  )
}

const BUDGET_STATE = { NORMAL: 'normal', CAUTION: 'caution', OVER: 'over' } satisfies Record<BudgetState, BudgetProgressState>

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
