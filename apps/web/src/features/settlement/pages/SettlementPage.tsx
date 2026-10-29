import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useEffect, useId } from 'react'
import { useNavigate } from 'react-router'
import { isApiError, keys } from '../../../api'
import { paths } from '../../../app/paths'
import { useTripDetail } from '../../../app/trip'
import { CardHeroTone, formatKrw, SettlementRow } from '../../../ds'
import { settlementQuery } from '../api'
import type { SettlementView } from '../types'
import { CardsSkeleton, InlineError, SectionLabel, TabTitle } from '../ui'
import { memberState, orderByMember, routeDate, settlementNetOf, settlementRowLabel, toPersonAt } from '../view'

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

  return (
    <>
      <TabTitle>정산</TabTitle>
      {settlement.isPending ? (
        <CardsSkeleton rows={4} />
      ) : !settlement.data ? (
        <InlineError onRetry={() => void settlement.refetch()} />
      ) : (
        <SettlementContent view={settlement.data} />
      )}
    </>
  )
}

function SettlementContent({ view }: { view: SettlementView }) {
  const trip = useTripDetail()
  const navigate = useNavigate()
  const listId = useId()
  return (
    <div className="flex flex-col pb-6">
      <div className="px-gutter">
        {/* 톤 영웅(Card/HeroTone, HF-25): 총 공동 지출 → N빵 1인 → 도착한 경로 */}
        <CardHeroTone
          headingLevel={3}
          label="총 공동 지출"
          hero={formatKrw(view.totalSharedKrw)}
          sub={
            <span className="flex items-center gap-1.5 whitespace-nowrap">
              N빵 1인 <span className="text-body-s-strong text-primary">{formatKrw(view.perCapitaKrw)}</span>
            </span>
          }
          route={{ phase: 'ended', start: routeDate(trip.startDate), end: routeDate(trip.endDate), days: trip.days }}
        />
      </div>
      <SectionLabel id={listId} level={3} className="px-gutter pt-8 pb-1">
        멤버별 정산
      </SectionLabel>
      <ul aria-labelledby={listId}>
        {orderByMember(view.members).map((row) => {
          const { withdrawn, left } = memberState(row.member, row.isLeft)
          return (
            <li key={row.member.membershipId}>
              <SettlementRow
                person={toPersonAt(row.member, left)}
                paid={row.paidKrw}
                share={row.burdenKrw}
                netAmount={row.netKrw}
                net={settlementNetOf(row.direction)}
                member={left ? 'left' : 'active'}
                aria-label={settlementRowLabel(row, left)}
                // 탈퇴한 멤버는 상세로 가지 않는다(›·탭 없음, 화면명세 0-8)
                tappable={!withdrawn}
                onClick={withdrawn ? undefined : () => navigate(paths.settlementMember(trip.tripId, row.member.membershipId))}
              />
            </li>
          )
        })}
      </ul>
    </div>
  )
}
