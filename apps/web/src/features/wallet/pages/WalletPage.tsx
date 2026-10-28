import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { clsx } from 'clsx'
import { useState } from 'react'
import { Link } from 'react-router'
import { isApiError, keys } from '../../../api'
import { paths } from '../../../app/paths'
import { ErrorScreen, LoadingScreen } from '../../../app/states'
import { useCurrentTrip } from '../../../app/trip'
import {
  BottomSheet,
  Callout,
  Icon,
  IconButton,
  ListItem,
  RowAccount,
  RowAdd,
  SheetContentOption,
  ShellSub,
} from '../../../ds'
import { focusRing } from '../../../ds/styles'
import { paymentMethodsQuery, requestSync, tripFxQuery } from '../api'
import { RemoveMethodFlow } from '../components/RemoveMethodFlow'
import { FinConsentSheet } from '../consent'
import { formatFxLabel, formatKstTime, formatSyncedAt } from '../format'
import type { PaymentMethodsResponse, PaymentMethodView } from '../types'
import { useBack } from '../useBack'
import { useTossConnect } from '../useTossConnect'

const SYNC_POLL_MS = 1500
const SYNC_MAX_MS = 15_000
const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))

/** WF-27 지갑 · WF-42 연결 만료 · WF-28 계좌·카드 추가 시트 */
export default function WalletPage() {
  const back = useBack(paths.splash())
  const methods = useQuery(paymentMethodsQuery())

  return (
    <ShellSub header={{ title: '지갑', onBack: back }} gutter={false}>
      {methods.data ? (
        <WalletContent data={methods.data} />
      ) : methods.isPending ? (
        <LoadingScreen inset />
      ) : (
        <ErrorScreen error={methods.error} onRetry={() => void methods.refetch()} />
      )}
    </ShellSub>
  )
}

function WalletContent({ data }: { data: PaymentMethodsResponse }) {
  const queryClient = useQueryClient()
  const [adding, setAdding] = useState(false)
  const [menuFor, setMenuFor] = useState<PaymentMethodView | null>(null)
  const addConnect = useTossConnect({ screen: 'WF-28' })
  const reconnect = useTossConnect({ screen: 'WF-42' })

  const expiredConnection = data.connections.find((c) => c.status === 'EXPIRED')
  const sync = useMutation({
    mutationFn: async () => {
      const before = data.lastSyncedAt
      try {
        await requestSync()
      } catch (error) {
        // 60초 제한(429)·만료(409)·제공자 장애: 토스트 없이 목록만 다시 받는다(FR-402)
        if (isApiError(error) && error.status === 401) throw error
        return
      }
      // 202 뒤 동기화가 끝나 시각이 바뀔 때까지 최대 15초 기다린다
      const deadline = Date.now() + SYNC_MAX_MS
      while (Date.now() < deadline) {
        const next = await queryClient.fetchQuery({ ...paymentMethodsQuery(), staleTime: 0 })
        if (next.lastSyncedAt !== before) return
        await wait(SYNC_POLL_MS)
      }
    },
    onSettled: () => queryClient.invalidateQueries({ queryKey: keys.wallet.methods }),
    meta: { silent: true },
  })

  const empty = data.methods.length === 0
  const lastOfConnection = (method: PaymentMethodView) =>
    data.methods.filter((m) => m.connectionId === method.connectionId).length === 1

  return (
    <>
      {expiredConnection && (
        <div className="px-gutter">
          <Callout
            tone="disconnected"
            style="tone"
            label="토스 연결 만료"
            disabled={reconnect.isPending}
            onClick={() => reconnect.start({ purpose: 'RECONNECT', reconnectConnectionId: expiredConnection.id })}
          />
        </div>
      )}

      <section aria-labelledby="wallet-methods" className="flex flex-col">
        <div
          className={clsx(
            'flex min-h-8 items-center justify-between gap-2 px-gutter',
            expiredConnection ? 'pt-7 pb-1.5' : 'mb-2',
          )}
        >
          <h2 id="wallet-methods" className="text-body-s-strong text-secondary">
            연결된 계좌·카드
          </h2>
          {!empty && data.lastSyncedAt && (
            <div className="flex items-center gap-0.5">
              <span className="text-caption text-tertiary">{formatSyncedAt(data.lastSyncedAt)}</span>
              {!expiredConnection && (
                <IconButton
                  size="s"
                  icon="refresh"
                  label="동기화"
                  aria-busy={sync.isPending || undefined}
                  disabled={sync.isPending}
                  onClick={() => sync.mutate()}
                  className={clsx('text-icon-subtle', sync.isPending && 'animate-spin motion-reduce:animate-none')}
                />
              )}
            </div>
          )}
        </div>

        {empty && <p className="px-gutter py-3 text-body-m text-secondary">연결된 계좌·카드가 없어요</p>}

        <ul className="flex flex-col">
          {data.methods.map((method) => (
            <li key={method.id}>
              {method.status === 'EXPIRED' ? (
                <ListItem
                  type="value"
                  leadingIcon={method.type === 'CARD' ? 'card' : 'bank'}
                  title={method.productName}
                  subtitle={method.maskedNumber}
                  className="opacity-40"
                />
              ) : (
                <RowAccount
                  type={method.type === 'CARD' ? 'card' : 'bank'}
                  name={method.productName}
                  masked={method.maskedNumber}
                  moreLabel={`${method.productName} 더 보기`}
                  onMoreClick={() => setMenuFor(method)}
                />
              )}
            </li>
          ))}
        </ul>

        {!expiredConnection && <RowAdd label="계좌·카드 추가" onClick={() => setAdding(true)} />}
      </section>

      <FxSection />

      <BottomSheet
        open={adding}
        onClose={() => setAdding(false)}
        title="계좌·카드 추가"
        cta={{
          label: '연결',
          disabled: addConnect.isPending,
          onClick: () => {
            setAdding(false)
            addConnect.start({ purpose: 'WALLET_ADD' })
          },
        }}
      >
        <SheetContentOption options={[{ value: 'TOSS', title: '토스로 불러오기' }]} value="TOSS" aria-label="불러올 곳" />
      </BottomSheet>

      <RemoveMethodFlow
        method={menuFor}
        isLastOfConnection={menuFor ? lastOfConnection(menuFor) : false}
        onClose={() => setMenuFor(null)}
      />
      <FinConsentSheet {...addConnect.consentSheet} />
      <FinConsentSheet {...reconnect.consentSheet} />
    </>
  )
}

/** 지금 여정(헤더 기준)의 환율 카드. 여정이 없거나 KRW 여정이면 그리지 않는다(FR-806) */
function FxSection() {
  const { tripId, trip } = useCurrentTrip()
  const foreign = Boolean(tripId && trip?.fx)
  const fx = useQuery({ ...tripFxQuery(tripId ?? ''), enabled: foreign, meta: { silent: true } })
  const current = fx.data?.current
  if (!tripId || !foreign || !fx.data || fx.data.isKrwTrip) return null

  return (
    <section aria-labelledby="wallet-fx" className="flex flex-col gap-3 px-gutter pt-7">
      <h2 id="wallet-fx" className="text-body-s-strong text-secondary">
        환율
      </h2>
      <Link
        to={paths.fx(tripId)}
        className={clsx(
          'flex items-center justify-between gap-3 rounded-lg bg-subtle py-4 pr-4 pl-5 transition-[filter] active:brightness-95',
          focusRing,
        )}
      >
        <span className="flex min-w-0 flex-col gap-0.5">
          <span className="font-amount text-amount-m text-primary">
            {current
              ? formatFxLabel(current.displayUnit, current.currencyNameKo, current.displayRate)
              : `${fx.data.displayUnit}${fx.data.currencyNameKo} = —`}
          </span>
          {current && (
            <span className="text-caption text-tertiary">
              {current.source} · {formatKstTime(current.effectiveAt)}
            </span>
          )}
        </span>
        <Icon name="chevron-right" size={20} className="shrink-0 text-icon-subtle" />
      </Link>
    </section>
  )
}
