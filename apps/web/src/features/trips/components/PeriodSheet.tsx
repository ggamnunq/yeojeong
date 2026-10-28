import { useState } from 'react'
import { BottomSheet, Input } from '../../../ds'
import { periodError, periodLimits, type TripFormMode } from '../rules'

// 기간 선택 시트(화면명세 부록 C-9). DS에 날짜 범위 선택기가 없어(부록 B-9) 네이티브 날짜 입력 두 칸으로 받는다.
// 고를 수 없는 날짜는 min·max로 막는다. 진행 중 수정이면 출발일은 잠그고 도착일은 오늘 이후만.
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

export function PeriodSheet({ open, value, mode, today, startLocked = false, onApply, onClose }: PeriodSheetProps) {
  const [draft, setDraft] = useState<Period>(value)
  // 열 때마다 지금 값으로 다시 시작한다
  const [wasOpen, setWasOpen] = useState(open)
  if (open !== wasOpen) {
    setWasOpen(open)
    if (open) setDraft(value)
  }
  const limits = periodLimits(draft.startDate, mode, today)
  const error = periodError(draft, mode, today)
  const complete = Boolean(draft.startDate && draft.endDate)

  return (
    <BottomSheet
      open={open}
      title="기간"
      onClose={onClose}
      cta={{ label: '확인', disabled: !complete || error !== null, onClick: () => onApply(draft) }}
    >
      <div className="flex flex-col gap-4">
        <Input
          type="date"
          label="출발일"
          value={draft.startDate}
          min={startLocked ? undefined : limits.startMin}
          disabled={startLocked}
          onChange={(e) => setDraft((d) => ({ ...d, startDate: e.target.value }))}
        />
        <Input
          type="date"
          label="도착일"
          value={draft.endDate}
          min={limits.endMin}
          max={limits.endMax}
          error={error !== null}
          helper={error ?? undefined}
          onChange={(e) => setDraft((d) => ({ ...d, endDate: e.target.value }))}
        />
      </div>
    </BottomSheet>
  )
}
