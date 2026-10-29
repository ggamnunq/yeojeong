import { clsx } from 'clsx'
import type { ReactNode } from 'react'
import { Callout, Chip, DateHeader, Icon, SegmentedControl } from '../../../ds'
import { focusRing } from '../../../ds/styles'
import type { PaymentsView } from '../types'

// 결제내역 리스트·타임라인 공통 조각(화면명세 WF-18·19, direction §5 「컨트롤 한 줄」 · 「날짜 헤더」).

export type ControlRowProps = {
  /** 내 미확정 수(배너 n). 0이면 토글만 오른쪽 */
  pendingCount: number
  /** 미확정만 보기 중 */
  filterOn: boolean
  onToggleFilter: () => void
  view: PaymentsView
  onViewChange: (view: PaymentsView) => void
}

/**
 * 컨트롤 한 줄: 왼쪽 인라인 Callout Pending "● 확인 필요 n건 ›" · 오른쪽 SegmentedControl "리스트 | 타임라인".
 * 미확정만 보기 중이면 배너가 선택 상태(진한 테두리 + ✕, Q-19 추천)로 바뀐다.
 */
export function ControlRow({ pendingCount, filterOn, onToggleFilter, view, onViewChange }: ControlRowProps) {
  const label = `확인 필요 ${pendingCount}건`
  return (
    <div className="flex items-center justify-between gap-3 px-5 pb-0.5">
      {pendingCount > 0 ? (
        filterOn ? (
          // 미확정만 보기 중: Chip Removable(선택 + 오른쪽 ✕). 누르면 필터를 푼다
          <Chip
            removable
            selected
            label={label}
            aria-label={`${label}, 미확정만 보기 해제`}
            onChange={onToggleFilter}
            className="min-w-0"
          />
        ) : (
          <Callout tone="pending" style="inline" label={label} aria-pressed={false} onClick={onToggleFilter} />
        )
      ) : (
        <span />
      )}
      <SegmentedControl
        size="s"
        className="shrink-0"
        aria-label="보기"
        labels={['리스트', '타임라인']}
        selected={view === 'list' ? 'first' : 'second'}
        onChange={(selected) => onViewChange(selected === 'first' ? 'list' : 'timeline')}
      />
    </div>
  )
}

/** 날짜 헤더: DS DateHeader Style=Plain(띠 없음 · Day 3차 글자 · 합계 없음, C-07) */
export function PlainDateHeader({ date, day }: { date: ReactNode; day: ReactNode }) {
  return <DateHeader style="plain" date={date} day={day} />
}

/** 목록 맨 아래 "기간 외 결제 추가 ›" 진입 행(WF-45, bg/subtle · radius 16) */
export function OutOfPeriodEntry({ onClick }: { onClick: () => void }) {
  return (
    <div className="px-5 pt-4 pb-6">
      <button
        type="button"
        onClick={onClick}
        className={clsx(
          'flex w-full items-center gap-2.5 rounded-lg bg-subtle p-4 text-left transition-[filter] select-none active:brightness-95',
          focusRing,
        )}
      >
        <Icon name="plus" size={20} className="shrink-0 text-icon-default" />
        <span className="min-w-0 flex-1 text-body-m-strong text-primary">기간 외 결제 내역 추가</span>
        <Icon name="chevron-right" size={20} className="shrink-0 text-icon-subtle" />
      </button>
    </div>
  )
}
