import { useInfiniteQuery } from '@tanstack/react-query'
import { clsx } from 'clsx'
import { Suspense } from 'react'
import { Outlet, useNavigate } from 'react-router'
import { paths } from '../../app/paths'
import { ErrorScreen, LoadingScreen } from '../../app/states'
import { DateHeader, EmptyState, PaymentRow, RowAdd, ShellSub } from '../../ds'
import { formatDateLabel } from '../payments/rules'
import { useLoadMore } from '../payments/useLoadMore'
import { useBack } from '../wallet/useBack'
import { walletEntriesQuery } from './api'
import { monthTotalLabel, walletMeta, walletOriginal } from './rules'
import type { WalletEntry } from './types'

// WF-49 내 지갑(수동, accountLink=false) · WF-49b 빈 상태. 행 탭 → WF-50(지갑 폼), "결제 추가" → WF-48.
// "이번 달" 합계는 서버 필드(monthTotalKrw · monthTotalEstimated, S7b 예정)가 있을 때만 보인다.

export default function WalletListPage() {
  const back = useBack(paths.splash())
  const navigate = useNavigate()
  const query = useInfiniteQuery(walletEntriesQuery())
  const { hasNextPage, isFetchingNextPage, fetchNextPage } = query
  const items = query.data?.pages.flatMap((p) => p.items) ?? []
  // "이번 달"은 서버 합계(monthTotalKrw, S7b)만 쓴다 — 페이지를 더하지 않는다. 없으면 영웅 숫자를 숨긴다
  const first = query.data?.pages[0]
  const monthTotal = first?.monthTotalKrw
  const sentinel = useLoadMore<HTMLDivElement>(Boolean(hasNextPage) && !isFetchingNextPage, () => void fetchNextPage())

  const add = () => navigate(paths.walletNew(), { state: { fromList: true } })
  const open = (entry: WalletEntry) => navigate(paths.walletEntryEdit(entry.id), { state: { fromList: true } })
  const empty = query.isSuccess && items.length === 0

  return (
    <ShellSub header={{ title: '내 지갑', onBack: back }} gutter={false} cta={empty ? { label: '결제 추가', onClick: add } : undefined}>
      {query.isPending ? (
        <LoadingScreen inset gutter />
      ) : query.isError && !query.data ? (
        <ErrorScreen error={query.error} onRetry={() => void query.refetch()} />
      ) : empty ? (
        <EmptyState type="no-payments" title="결제 기록이 없어요" message="" className="flex-1 pt-16" />
      ) : (
        <>
          {monthTotal !== undefined && (
            <div className="flex flex-col gap-1 px-gutter">
              <p className="text-body-s-strong text-secondary">이번 달</p>
              <p className="font-amount text-amount-xl text-primary">{monthTotalLabel(monthTotal, first?.monthTotalEstimated)}</p>
            </div>
          )}
          <RowAdd label="결제 추가" className={clsx(monthTotal !== undefined && 'mt-4')} onClick={add} />
          <div className="h-1" />
          {groupEntries(items).map((group, index) => (
            <section key={group.localDate} aria-label={group.label} className={clsx(index > 0 && 'pt-4')}>
              <DateHeader style="plain" date={group.label} />
              {group.items.map((entry) => (
                <PaymentRow
                  key={entry.id}
                  leading="none"
                  merchant={entry.merchantName}
                  meta={walletMeta(entry)}
                  amount={entry.krwAmount ?? 0}
                  originalAmount={walletOriginal(entry) ?? undefined}
                  onClick={() => open(entry)}
                />
              ))}
            </section>
          ))}
          <div ref={sentinel} aria-hidden />
          {isFetchingNextPage && <LoadingScreen inset gutter />}
          <div className="h-6" />
        </>
      )}
      <Suspense fallback={null}>
        <Outlet />
      </Suspense>
    </ShellSub>
  )
}

/** 받은 순서(최신순) 그대로 KST 날짜별로 묶는다. 날짜 헤더 "11.13 (금)" — 일차·합계 없음 */
function groupEntries(items: readonly WalletEntry[]) {
  const groups: { localDate: string; label: string; items: WalletEntry[] }[] = []
  for (const item of items) {
    const last = groups.at(-1)
    if (last?.localDate === item.localDate) last.items.push(item)
    else groups.push({ localDate: item.localDate, label: formatDateLabel(item.localDate), items: [item] })
  }
  return groups
}
