import { useInfiniteQuery, useQueries } from '@tanstack/react-query'
import { clsx } from 'clsx'
import { Suspense } from 'react'
import { Outlet, useNavigate } from 'react-router'
import { paths } from '../../app/paths'
import { ErrorScreen, LoadingScreen } from '../../app/states'
import { DateHeader, EmptyState, PaymentRow, RowAdd, ShellSub } from '../../ds'
import { formatDateLabel } from '../payments/rules'
import { useLoadMore } from '../payments/useLoadMore'
import { useBack } from '../wallet/useBack'
import { QuietButton } from '../card-import/components'
import { startFlowState } from '../card-import/flow'
import { useCardImportConfig, useCardImportEnabled } from '../card-import/hooks'
import { latestFxQuery, walletEntriesQuery } from './api'
import { monthTotalLabel, walletMeta, walletRowAmounts } from './rules'
import type { WalletEntry } from './types'

// WF-49 내 지갑(수동, accountLink=false) · WF-49b 빈 상태. 행 탭 → WF-50(지갑 폼), "결제 추가" → WF-48.
// (v0.7.0, features.cardImport) 헤더 "불러오기"·빈 상태 "카드 내역 불러오기" → WF-51(남은 횟수 0이면 그 화면이 WF-57d를 그린다).
// "이번 달" 합계는 서버 S7b 필드(monthTotalKrw · 추정이 섞이면 monthTotalEstimated → "약 ₩…")를 그대로 쓴다.

export default function WalletListPage() {
  const back = useBack(paths.splash())
  const navigate = useNavigate()
  const query = useInfiniteQuery(walletEntriesQuery())
  const { hasNextPage, isFetchingNextPage, fetchNextPage } = query
  const items = query.data?.pages.flatMap((p) => p.items) ?? []
  // "이번 달"은 서버 합계(monthTotalKrw, S7b)만 쓴다 — 페이지를 더하지 않는다(첫 페이지 값)
  const first = query.data?.pages[0]
  // 원화가 없는 외화 항목(결제 시점 고시 없음)은 최신 고시로 "약 ₩X"를 추정한다(통화별 한 번, 실패하면 원화 줄 숨김)
  const unknownCurrencies = [...new Set(items.filter((e) => e.krwAmount === null && e.currency !== 'KRW').map((e) => e.currency))]
  const fx = useQueries({ queries: unknownCurrencies.map((currency) => latestFxQuery(currency)) })
  const rateOf = (currency: string) => fx[unknownCurrencies.indexOf(currency)]?.data?.rate ?? null
  const sentinel = useLoadMore<HTMLDivElement>(Boolean(hasNextPage) && !isFetchingNextPage, () => void fetchNextPage())

  // 카드 내역 불러오기 진입점. 설정(remainingToday)은 미리 받아 둔다(꺼져 있으면 부르지 않는다)
  const cardImport = useCardImportEnabled()
  useCardImportConfig()
  const openImport = () => navigate(paths.walletImport(), { state: startFlowState })

  const add = () => navigate(paths.walletNew(), { state: { fromList: true } })
  const open = (entry: WalletEntry) => navigate(paths.walletEntryEdit(entry.id), { state: { fromList: true } })
  const empty = query.isSuccess && items.length === 0

  return (
    <ShellSub
      header={{ title: '내 지갑', onBack: back, textAction: cardImport ? { label: '불러오기', onClick: openImport } : undefined }}
      gutter={false} cta={empty ? { label: '결제 추가', leadingIcon: true, icon: 'plus', onClick: add } : undefined}>
      {query.isPending ? (
        <LoadingScreen inset gutter />
      ) : query.isError && !query.data ? (
        <ErrorScreen error={query.error} onRetry={() => void query.refetch()} />
      ) : empty ? (
        // HF-49b: 일러스트·문구는 남은 높이의 세로 가운데
        <>
          <EmptyState type="no-payments" title="결제 기록이 없어요" message="" className="flex-1 justify-center" />
          {/* HF-49b: 버튼 바로 위 조용한 텍스트 버튼(2버튼이 아니다) */}
          {cardImport && <QuietButton onClick={openImport}>카드 내역 불러오기</QuietButton>}
        </>
      ) : (
        <>
          {first && (
            <div className="flex flex-col gap-1 px-gutter">
              <p className="text-body-s-strong text-secondary">이번 달</p>
              <p className="font-amount text-amount-xl text-primary">{monthTotalLabel(first.monthTotalKrw, first.monthTotalEstimated)}</p>
            </div>
          )}
          <RowAdd label="결제 추가" className="mt-4" onClick={add} />
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
                  {...walletRowAmounts(entry, entry.krwAmount === null ? rateOf(entry.currency) : null)}
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
