import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useEffect, useId } from 'react'
import { useNavigate } from 'react-router'
import { isApiError, keys } from '../../../api'
import { paths } from '../../../app/paths'
import { useTripDetail } from '../../../app/trip'
import { formatKrw, RouteProgress, SettlementRow } from '../../../ds'
import { settlementQuery } from '../api'
import type { SettlementView } from '../types'
import { CardsSkeleton, InlineError, SectionLabel } from '../ui'
import { orderByMember, routeDate, settlementNetOf, settlementRowLabel, toPerson } from '../view'

// WF-25·44 / HF-25·44 정산 요약(종료 후 기본 탭). 톤 영웅(총 공동 지출 · N빵 1인 · 도착한 경로) → 멤버별 정산 행.
// 송금 권장안(transfers)·예산·안내 문장은 그리지 않는다(C-14). 나간 멤버도 결제·부담이 있으면 남는다(FR-705).
export default function SettlementPage() {
  const trip = useTripDetail()
  const queryClient = useQueryClient()
  const settlement = useQuery(settlementQuery(trip.tripId))
  const phaseInvalid = isApiError(settlement.error) && settlement.error.status === 409

  // 아직 종료 전(409 TRIP_PHASE_INVALID): 여정을 다시 받아 셸이 이 단계의 탭으로 보내게 한다
  useEffect(() => {
    if (phaseInvalid) void queryClient.invalidateQueries({ queryKey: keys.trips.detail(trip.tripId), exact: true })
  }, [phaseInvalid, queryClient, trip.tripId])

  if (settlement.isPending) return <CardsSkeleton rows={4} />
  if (!settlement.data) return <InlineError onRetry={() => void settlement.refetch()} />
  return <SettlementContent view={settlement.data} />
}

function SettlementContent({ view }: { view: SettlementView }) {
  const trip = useTripDetail()
  const navigate = useNavigate()
  const heroId = useId()
  const listId = useId()
  return (
    <div className="flex flex-col pb-6">
      <div className="px-gutter">
        {/* 영웅 카드 · 톤(direction §5): 라벨 → 4 → 숫자 40 → 6 → N빵 1인 → 24 → 경로(Ended) */}
        <section aria-labelledby={heroId} className="flex flex-col rounded-xl bg-subtle px-5 pt-6 pb-5">
          <h2 id={heroId} className="text-body-s text-secondary">
            총 공동 지출
          </h2>
          <p className="mt-1 font-amount text-amount-xl whitespace-nowrap text-amount-default">{formatKrw(view.totalSharedKrw)}</p>
          <p className="mt-1.5 flex items-center gap-1.5 text-body-s whitespace-nowrap">
            <span className="text-secondary">N빵 1인</span>
            <span className="text-body-s-strong text-primary">{formatKrw(view.perCapitaKrw)}</span>
          </p>
          <RouteProgress
            className="mt-6"
            phase="ended"
            start={routeDate(trip.startDate)}
            end={routeDate(trip.endDate)}
            days={trip.days}
          />
        </section>
      </div>
      <SectionLabel id={listId} className="px-gutter pt-8 pb-1">
        멤버별 정산
      </SectionLabel>
      <ul aria-labelledby={listId}>
        {orderByMember(view.members).map((row) => {
          const left = row.isLeft || row.member.isLeft
          return (
            <li key={row.member.membershipId}>
              <SettlementRow
                person={toPerson(row.member, left)}
                paid={row.paidKrw}
                share={row.burdenKrw}
                netAmount={row.netKrw}
                net={settlementNetOf(row.direction)}
                member={left ? 'left' : 'active'}
                aria-label={settlementRowLabel(row, left)}
                onClick={() => navigate(paths.settlementMember(trip.tripId, row.member.membershipId))}
              />
            </li>
          )
        })}
      </ul>
    </div>
  )
}
