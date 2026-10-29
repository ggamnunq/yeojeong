import { useMutation, useQuery, useQueryClient, type UseQueryResult } from '@tanstack/react-query'
import { clsx } from 'clsx'
import { useState } from 'react'
import { Navigate, useLocation, useNavigate } from 'react-router'
import { isApiError, keys } from '../../../api'
import { paths } from '../../../app/paths'
import { useTripDetail } from '../../../app/trip'
import { Button, Callout, Checkbox, EmptyState, formatKrw, SegmentedControl, ShellSub } from '../../../ds'
import { toast } from '../../../notifications'
import { FinConsentSheet } from '../../auth/components/FinConsentSheet'
import { paymentMethodsQuery } from '../../wallet/api'
import { useTossConnect } from '../../wallet/useTossConnect'
import { addOutOfPeriod, isOutOfPeriodKey, outOfPeriodQuery } from '../api'
import { formatOriginal } from '../rules'
import type { OutOfPeriodCandidate, OutOfPeriodSide } from '../types'

/** 한 번에 추가할 수 있는 최대 건수(FR-408) */
const MAX_PICK = 50

/**
 * 기간 외 결제 추가(WF-43, FR-408): [여정 전 | 여정 후](C-12: 탭은 두고 진행 중 "여정 후"는 빈 상태) → 내 거래 체크 → "{n}건 추가".
 * 후보는 열 때·탭을 바꿀 때마다 서버가 제공자에서 실시간 조회한다(저장 안 함). 그동안 행 스켈레톤 4개 + 버튼 비활성.
 * candidateId는 5분짜리 서명된 임시 식별자이고, 고른 것만 POST …/out-of-period-expenses로 저장된다.
 * 추가한 결제는 미확정으로 결제내역에 들어간다(날짜 헤더 "여정 전"). 진행 중에만 — 그 밖에는 결제내역으로 보낸다.
 */
export default function OutOfPeriodPage() {
  const trip = useTripDetail()
  const navigate = useNavigate()
  const location = useLocation()
  const queryClient = useQueryClient()
  const [side, setSide] = useState<OutOfPeriodSide>('BEFORE')
  const [picked, setPicked] = useState<string[]>([])
  const ongoing = trip.status === 'ONGOING'
  const query = useQuery({ ...outOfPeriodQuery(trip.tripId, side), enabled: ongoing })
  const loading = query.isPending || query.isFetching
  // 후보를 새로 받으면 식별자가 바뀐다 → 지금 목록에 있는 것만 고른 것으로 친다
  const chosen = loading ? [] : picked.filter((id) => query.data?.some((c) => c.candidateId === id))

  const add = useMutation({
    mutationFn: (candidateIds: string[]) => addOutOfPeriod(trip.tripId, candidateIds),
    onSuccess: (res) => {
      toast.success(`${res.added}건 추가했어요`)
      // 결제내역·현황은 새로 받고, 후보는 다시 조회하지 않는다(나가는 화면이 제공자를 또 부르지 않게)
      void queryClient.invalidateQueries({
        queryKey: keys.trips.detail(trip.tripId),
        predicate: (q) => !isOutOfPeriodKey(q.queryKey),
      })
      navigate(paths.payments(trip.tripId), { replace: true })
    },
    // 400 OUT_OF_PERIOD_CANDIDATE_INVALID(만료·이미 추가·범위 밖) 등 → 고른 것을 비우고 후보를 다시 조회한다
    onError: () => {
      setPicked([])
      void query.refetch()
    },
  })

  // 409 CONNECTION_EXPIRED → 「토스 연결 만료」를 누르면 그 연결의 재연결을 바로 시작한다(없으면 지갑으로)
  const expired = isApiError(query.error) && query.error.code === 'CONNECTION_EXPIRED'
  const methods = useQuery({ ...paymentMethodsQuery(), enabled: expired })
  const connect = useTossConnect()
  const reconnect = () => {
    const connection = methods.data?.connections.find((c) => c.status === 'EXPIRED')
    const here = `${location.pathname}${location.search}`
    if (connection) connect.start({ purpose: 'RECONNECT', reconnectConnectionId: connection.id, from: here, returnTo: here })
    else navigate(paths.wallet())
  }

  if (!ongoing) return <Navigate replace to={paths.payments(trip.tripId)} />

  const back = () => {
    if (location.key !== 'default') navigate(-1)
    else navigate(paths.payments(trip.tripId), { replace: true })
  }
  const toggle = (id: string, on: boolean) =>
    setPicked((prev) => (on ? (prev.length >= MAX_PICK || prev.includes(id) ? prev : [...prev, id]) : prev.filter((x) => x !== id)))

  return (
    <ShellSub
      header={{ title: '기간 외 결제 추가', onBack: back }}
      gutter={false}
      cta={{ label: `${chosen.length}건 추가`, disabled: chosen.length === 0 || loading, onClick: () => add.mutate(chosen), state: add.isPending ? 'loading' : 'default' }}
    >
      <div className="px-gutter pb-2">
        <SegmentedControl
          aria-label="기간"
          labels={['여정 전', '여정 후']}
          selected={side === 'BEFORE' ? 'first' : 'second'}
          onChange={(selected) => {
            setSide(selected === 'first' ? 'BEFORE' : 'AFTER')
            setPicked([])
          }}
        />
      </div>
      <Candidates
        query={query}
        loading={loading}
        picked={chosen}
        onToggle={toggle}
        reconnecting={connect.isPending}
        onReconnect={reconnect}
      />
      {connect.consentSheet && <FinConsentSheet {...connect.consentSheet} />}
    </ShellSub>
  )
}

function Candidates({
  query,
  loading,
  picked,
  onToggle,
  reconnecting,
  onReconnect,
}: {
  query: UseQueryResult<OutOfPeriodCandidate[]>
  loading: boolean
  picked: readonly string[]
  onToggle: (id: string, on: boolean) => void
  reconnecting: boolean
  onReconnect: () => void
}) {
  if (loading || query.isPending) {
    return (
      <div role="status" aria-label="불러오는 중" aria-busy="true" className="flex flex-col gap-6 px-gutter py-4">
        {Array.from({ length: 4 }, (_, i) => (
          <div key={i} className="flex items-center gap-3.5">
            <div className="size-5.5 shrink-0 animate-pulse rounded-xs bg-muted motion-reduce:animate-none" />
            <div className="flex flex-1 flex-col gap-2">
              <div className="h-3.5 w-2/3 animate-pulse rounded-sm bg-muted motion-reduce:animate-none" />
              <div className="h-3 w-1/4 animate-pulse rounded-sm bg-muted motion-reduce:animate-none" />
            </div>
          </div>
        ))}
      </div>
    )
  }
  if (query.isError) {
    // 연결 만료(409 CONNECTION_EXPIRED)면 빈 상태 대신 다시 연결
    if (isApiError(query.error) && query.error.code === 'CONNECTION_EXPIRED') {
      return (
        <div className="px-gutter pt-2">
          <Callout tone="disconnected" style="tone" label="토스 연결 만료" disabled={reconnecting} onClick={onReconnect} />
        </div>
      )
    }
    return (
      <EmptyState
        type="no-payments"
        title="불러오지 못했어요"
        message=""
        role="alert"
        actions={<Button type="secondary" size="m" label="다시 시도" className="w-full" onClick={() => void query.refetch()} />}
      />
    )
  }
  if (query.data.length === 0) return <EmptyState type="no-payments" title="불러올 결제가 없어요" message="" className="pt-16" />

  const full = picked.length >= MAX_PICK
  return (
    <ul aria-label="기간 외 결제">
      {query.data.map((c) => {
        const on = picked.includes(c.candidateId)
        const [, mm, dd] = c.localDate.split('-')
        return (
          <li key={c.candidateId} className="px-5 py-0.5">
            <Checkbox
              className="w-full"
              checked={on}
              disabled={!on && full}
              onChange={(event) => onToggle(c.candidateId, event.target.checked)}
              label={
                <span className="flex min-w-0 flex-1 items-center gap-3.5">
                  <span className="flex min-w-0 flex-1 flex-col gap-0.5">
                    <span className="truncate text-body-m-strong text-primary">{c.merchantName}</span>
                    <span className="text-caption text-tertiary">{`${mm}.${dd}`}</span>
                  </span>
                  <span className={clsx('shrink-0 font-amount text-amount-s whitespace-nowrap', on ? 'text-amount-default' : 'text-secondary')}>
                    {c.krwAmount !== null ? formatKrw(c.krwAmount) : formatOriginal(c.originalAmount, c.currency)}
                  </span>
                </span>
              }
            />
          </li>
        )
      })}
    </ul>
  )
}
