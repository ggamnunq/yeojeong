import { useState } from 'react'
import { BottomSheet, SheetContentDateRange, type DateRangeValue } from '../../../ds'
import { periodError, periodLimits, TRIP_MAX_DAYS, type TripFormMode } from '../rules'

// 기간 선택 시트(화면명세 부록 C-9): DS SheetContent/DateRange(달력 범위 선택 + 「확인」). 시트 자체 CTA는 끈다.
// 고를 수 없는 날은 한도로 흐리게 막는다: 출발일 ≥ 오늘−30(만들기·시작 전), 길이 ≤ 31일, 진행 중 수정이면 출발일 잠금 · 도착일은 오늘 이후.
export type Period = { startDate: string; endDate: string }

export type PeriodSheetProps = {
  open: boolean
  value: Period
  mode: TripFormMode
  today: string
  startLocked?: boolean
  onApply: (period: Period) => void
  onClose: () => void
}

const toRange = ({ startDate, endDate }: Period): DateRangeValue => ({ start: startDate || null, end: endDate || null })

export function PeriodSheet({ open, value, mode, today, startLocked = false, onApply, onClose }: PeriodSheetProps) {
  const [draft, setDraft] = useState<DateRangeValue>(() => toRange(value))
  // 열 때마다 지금 값으로 다시 시작한다
  const [wasOpen, setWasOpen] = useState(open)
  if (open !== wasOpen) {
    setWasOpen(open)
    if (open) setDraft(toRange(value))
  }
  const period: Period = { startDate: draft.start ?? '', endDate: draft.end ?? '' }
  const limits = periodLimits(period.startDate, mode, today)
  const error = periodError(period, mode, today)
  const complete = Boolean(draft.start && draft.end)

  return (
    <BottomSheet open={open} title="기간" onClose={onClose}>
      {open && (
        <SheetContentDateRange
          value={draft}
          onChange={setDraft}
          today={today}
          // 진행 중 수정은 출발일(이미 지남)이 잠겨 있어 하한을 두지 않는다
          min={startLocked ? undefined : limits.startMin}
          endMin={limits.endMin}
          maxDays={TRIP_MAX_DAYS}
          startLocked={startLocked}
          cta={{ disabled: !complete || error !== null, onClick: () => onApply(period) }}
        />
      )}
    </BottomSheet>
  )
}
