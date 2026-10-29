import type { InfiniteData, UseInfiniteQueryResult } from '@tanstack/react-query'
import { clsx } from 'clsx'
import { useEffect } from 'react'
import { LoadingScreen } from '../../../app/states'
import { Button, EmptyState, orderMembers, payerLabel, Tag, TimelineItem, type TimelineItemType } from '../../../ds'
import { focusRing } from '../../../ds/styles'
import { groupByDate, kst, toPerson } from '../rules'
import { useLoadMore } from '../useLoadMore'
import type { ExpenseRow, ExpensesPage } from '../types'
import { PaymentListRow } from './PaymentListRow'
import { OutOfPeriodEntry, PlainDateHeader } from './ListParts'

type ExpensesResult = UseInfiniteQueryResult<InfiniteData<ExpensesPage>>

const itemsOf = (query: ExpensesResult) => query.data?.pages.flatMap((p) => p.items) ?? []

/** 첫 로딩 스켈레톤(행 6개) */
function Loading() {
  return (
    <div className="px-gutter">
      <LoadingScreen inset />
    </div>
  )
}

/** 조회 실패(화면명세 0-6·0-9) */
function LoadError({ onRetry }: { onRetry: () => void }) {
  return (
    <EmptyState
      type="no-payments"
      title="불러오지 못했어요"
      message=""
      role="alert"
      actions={<Button type="secondary" size="m" label="다시 시도" className="w-full" onClick={onRetry} />}
    />
  )
}

/** 빈 상태(EmptyState NoPayments, 설명 문장 없음) */
const Empty = () => <EmptyState type="no-payments" title="아직 결제가 없어요" message="" className="pt-16" />

// ── 리스트(WF-18) ─────────────────────────────────────────────────

export type ListViewProps = {
  query: ExpensesResult
  onOpen: (item: ExpenseRow) => void
  /** 진행 중이면 맨 아래 "기간 외 결제 추가" */
  onAddOutOfPeriod?: () => void
}

export function ListView({ query, onOpen, onAddOutOfPeriod }: ListViewProps) {
  const { hasNextPage, isFetchingNextPage, fetchNextPage } = query
  const sentinel = useLoadMore<HTMLDivElement>(Boolean(hasNextPage) && !isFetchingNextPage, () => void fetchNextPage())

  if (query.isPending) return <Loading />
  if (query.isError && !query.data) return <LoadError onRetry={() => void query.refetch()} />

  const groups = groupByDate(itemsOf(query))
  const showEntry = Boolean(onAddOutOfPeriod) && query.data.pages[0]?.showOutOfPeriodEntry
  return (
    <div className="flex flex-col pt-1">
      {groups.length === 0 && <Empty />}
      {groups.map((group, index) => (
        <section key={group.localDate} aria-label={`${group.label} ${group.day}`} className={clsx(index > 0 && 'pt-4')}>
          <PlainDateHeader date={group.label} day={group.day} />
          {group.items.map((item) => (
            <PaymentListRow key={item.id} item={item} onOpen={onOpen} />
          ))}
        </section>
      ))}
      <div ref={sentinel} aria-hidden />
      {isFetchingNextPage && (
        <div className="px-gutter">
          <LoadingScreen inset />
        </div>
      )}
      {showEntry && !hasNextPage && <OutOfPeriodEntry onClick={onAddOutOfPeriod!} />}
    </div>
  )
}

// ── 타임라인(WF-19) ───────────────────────────────────────────────

const TIMELINE_TYPE = { SHARED: 'shared', PERSONAL: 'personal', PENDING: 'pending' } as const satisfies Record<
  ExpenseRow['status'],
  TimelineItemType
>

/**
 * TimelineItem Position(DS v1.6): 첫 노드 first(위 레일 없음) · 마지막 last(아래 레일 없음) · 나머지 middle.
 * 노드가 하나뿐이면 Figma에 위아래 모두 없는 변형이 없어 last로 그리고 위 레일만 숨긴다
 */
function nodePosition(index: number, count: number): { position: 'first' | 'middle' | 'last'; className?: string } {
  if (count === 1) return { position: 'last', className: '[&>span:nth-child(2)>span:first-child]:invisible' }
  if (index === 0) return { position: 'first' }
  return { position: index === count - 1 ? 'last' : 'middle' }
}

export type TimelineViewProps = {
  query: ExpensesResult
  days: number
  day: number
  /** 진행 중이면 오늘 Day. 그 뒤 Day 칩은 흐리고 눌리지 않는다 */
  today: number | null
  /** 지금 시각 "18:34"(오늘을 볼 때 끝에 지금 노드) */
  nowTime: string
  onDayChange: (day: number) => void
  onOpen: (item: ExpenseRow) => void
}

export function TimelineView({ query, days, day, today, nowTime, onDayChange, onOpen }: TimelineViewProps) {
  const { hasNextPage, isFetchingNextPage, fetchNextPage } = query
  // 하루치는 끝까지 이어 받는다
  useEffect(() => {
    if (hasNextPage && !isFetchingNextPage) void fetchNextPage()
  }, [hasNextPage, isFetchingNextPage, fetchNextPage])

  const items = itemsOf(query)
  const showNow = today !== null && day === today
  return (
    <div className="flex flex-col">
      <DayChips days={days} day={day} today={today} onChange={onDayChange} />
      <div className="pt-3.5">
        {query.isPending ? (
          <Loading />
        ) : query.isError && !query.data ? (
          <LoadError onRetry={() => void query.refetch()} />
        ) : (
          <ol aria-label={`Day ${day} 결제`}>
            {items.map((item, index) => (
              <li key={item.id}>
                <TimelineItem
                  style="plain"
                  type={TIMELINE_TYPE[item.status]}
                  {...nodePosition(index, items.length + (showNow ? 1 : 0))}
                  time={kst(item.occurredAt).time}
                  merchant={item.merchantName}
                  meta={<TimelineMeta item={item} />}
                  amount={item.krwAmount}
                  participants={item.status === 'SHARED' && item.participants ? orderMembers(item.participants.map(toPerson)) : undefined}
                  onClick={() => onOpen(item)}
                />
              </li>
            ))}
            {showNow && (
              <li>
                <TimelineItem
                  style="plain"
                  type="now"
                  {...nodePosition(items.length, items.length + 1)}
                  time={nowTime}
                  merchant="지금"
                />
              </li>
            )}
          </ol>
        )}
        {query.isSuccess && items.length === 0 && <Empty />}
      </div>
    </div>
  )
}

/** 카드 2행: "내 결제" / 닉네임 + 플래그(변경됨 · 중복 의심) */
function TimelineMeta({ item }: { item: ExpenseRow }) {
  const label = payerLabel(toPerson(item.payer))
  if (!item.flags.changed && !item.flags.duplicateSuspected) return label
  return (
    <span className="inline-flex items-center gap-1.5">
      {label}
      {item.flags.changed && <Tag type="changed" size="s" />}
      {item.flags.duplicateSuspected && <Tag type="duplicate" size="s" />}
    </span>
  )
}

/**
 * Day 칩 줄 — Chip Style=Tone(v1.4 #20, 코드에 없어 조합). 선택 = 연보라 면 + 보라 글자, 앞으로 올 날 = 흐림·비활성.
 */
function DayChips({ days, day, today, onChange }: { days: number; day: number; today: number | null; onChange: (day: number) => void }) {
  return (
    <div role="group" aria-label="날짜" className="flex gap-2 overflow-x-auto px-5 pt-3.5 [scrollbar-width:none]">
      {Array.from({ length: days }, (_, i) => i + 1).map((n) => {
        const selected = n === day
        const future = today !== null && n > today
        return (
          <button
              key={n}
              type="button"
              aria-pressed={selected}
              disabled={future}
              onClick={() => onChange(n)}
              className={clsx(
                'h-9 shrink-0 rounded-full px-3.5 text-label-m whitespace-nowrap transition-colors select-none disabled:cursor-not-allowed',
                selected ? 'bg-brand-subtle text-brand' : 'bg-subtle text-secondary disabled:text-disabled',
                focusRing,
              )}
            >
              Day {n}
            </button>
        )
      })}
    </div>
  )
}
