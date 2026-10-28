import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useId, useState } from 'react'
import { Navigate } from 'react-router'
import { keys, type FxPolicy } from '../../../api'
import { paths } from '../../../app/paths'
import { ErrorScreen, LoadingScreen } from '../../../app/states'
import { useTripDetail } from '../../../app/trip'
import { Input, ShellSub } from '../../../ds'
import { toast } from '../../../notifications'
import { tripFxQuery, updateFxPolicy } from '../api'
import { FxPolicyOptions } from '../components/FxPolicyOptions'
import { formatFxRate, formatKstTime, fxUnitLabel } from '../format'
import type { TripFxView, UpdateFxPolicyRequest } from '../types'
import { useBack } from '../useBack'

/** WF-29 환율 표시 · 적용 기준(그룹장만 변경, FR-806·807) */
export default function FxPage() {
  const trip = useTripDetail()
  const back = useBack(paths.wallet())
  const fx = useQuery(tripFxQuery(trip.tripId))

  // KRW 여정은 환율 화면이 없다(지갑에서도 섹션을 숨긴다)
  if (!trip.fx || fx.data?.isKrwTrip) return <Navigate replace to={paths.wallet()} />

  return (
    <ShellSub
      header={{
        title: '환율',
        onBack: back,
        action: { icon: 'refresh', label: '새로고침', onClick: () => void fx.refetch() },
      }}
      gutter={false}
    >
      {fx.data ? (
        <FxContent tripId={trip.tripId} fx={fx.data} />
      ) : fx.isPending ? (
        <LoadingScreen inset />
      ) : (
        <ErrorScreen error={fx.error} onRetry={() => void fx.refetch()} />
      )}
    </ShellSub>
  )
}

const FIXED_RATE_PATTERN = /^\d{1,12}(\.\d{1,2})?$/

function FxContent({ tripId, fx }: { tripId: string; fx: TripFxView }) {
  const queryClient = useQueryClient()
  const labelId = useId()
  const current = fx.current
  // 고정 환율은 값을 넣어야 저장되므로 고르기만 한 상태를 따로 둔다
  const [choosingFixed, setChoosingFixed] = useState(false)
  const [fixedInput, setFixedInput] = useState(fx.fixedRate ?? current?.displayRate ?? '')
  const shown: FxPolicy = choosingFixed ? 'FIXED' : fx.policy

  const save = useMutation({
    mutationFn: (body: Omit<UpdateFxPolicyRequest, 'version'>) => updateFxPolicy(tripId, { ...body, version: fx.version }),
    onSuccess: ({ fx: next }) => {
      setChoosingFixed(false)
      queryClient.setQueryData(keys.trips.fx(tripId), next)
      // 여정 전체 금액이 다시 계산됐다(결제·현황·정산)
      void queryClient.invalidateQueries({ queryKey: keys.trips.detail(tripId) })
      toast.success('새 환율로 다시 계산했어요')
    },
    onError: () => void queryClient.invalidateQueries({ queryKey: keys.trips.fx(tripId) }),
  })

  const submitFixed = () => {
    const value = fixedInput.trim()
    if (!FIXED_RATE_PATTERN.test(value) || Number(value) <= 0) return
    if (fx.policy === 'FIXED' && fx.fixedRate !== null && Number(fx.fixedRate) === Number(value)) return
    save.mutate({ policy: 'FIXED', fixedRate: Number(value).toFixed(2) })
  }

  const unit = fxUnitLabel(fx.displayUnit, fx.currencyNameKo)

  return (
    <>
      <div className="px-gutter">
        <div className="flex flex-col rounded-xl bg-subtle px-5 pt-6 pb-5">
          <p className="text-body-s text-secondary">
            {fx.tripCurrency} → {fx.baseCurrency}
          </p>
          <p className="mt-1 font-amount text-amount-xl text-primary">
            <span className="text-[24px] font-semibold text-secondary">{unit} = </span>
            {current ? formatFxRate(current.displayRate) : '—'}
            <span className="text-[24px] font-semibold">원</span>
          </p>
          {current && (
            <p className="mt-1.5 text-body-s text-tertiary">
              {current.source} · {formatKstTime(current.effectiveAt)} 갱신
            </p>
          )}
        </div>
      </div>

      <div className="flex items-center justify-between px-gutter pt-8 pb-1">
        <h2 id={labelId} className="text-body-s-strong text-secondary">
          적용 환율
        </h2>
        <span className="text-body-s text-tertiary">그룹장 전용</span>
      </div>
      <FxPolicyOptions
        aria-labelledby={labelId}
        value={shown}
        disabled={!fx.canEdit}
        onChange={(policy) => {
          if (save.isPending) return
          if (policy === 'FIXED') {
            setChoosingFixed(true)
            return
          }
          setChoosingFixed(false)
          if (policy !== fx.policy) save.mutate({ policy })
        }}
      />

      {shown === 'FIXED' && fx.canEdit && (
        <form
          className="flex items-end gap-2 px-gutter pt-2"
          onSubmit={(event) => {
            event.preventDefault()
            submitFixed()
          }}
        >
          <Input
            label={`${unit}당`}
            name="fixedRate"
            inputMode="decimal"
            enterKeyHint="done"
            autoComplete="off"
            value={fixedInput}
            onChange={(event) => setFixedInput(event.currentTarget.value.replace(/[^\d.]/g, ''))}
            onBlur={submitFixed}
            disabled={save.isPending}
            className="min-w-0 flex-1"
          />
          <span className="pb-3.5 text-body-l text-primary">원</span>
        </form>
      )}
    </>
  )
}
