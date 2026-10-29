import { clsx } from 'clsx'
import { useEffect, useId, useRef, useState, type KeyboardEvent, type ReactNode } from 'react'
import { Button } from '../Button/Button'
import { IconButton } from '../IconButton/IconButton'
import { focusRing } from '../styles'
import {
  addDays,
  addMonths,
  DATE_RANGE_WEEKDAYS,
  formatDateLong,
  formatDateShort,
  formatMonth,
  isDateSelectable,
  localToday,
  monthGrid,
  monthOf,
  pickDate,
  type DateRangeField,
  type DateRangeLimits,
  type DateRangeValue,
  type YmdDate,
} from './rules'

// Figma SheetContent/DateRange(61:10354, v1.6 · components.json DateRangeSheet) + CTA(BOOLEAN). 기간 선택 시트 내용.
// Input Picker(InputPicker "출발일 – 도착일")를 누르면 BottomSheet(cta 끔) 안에 연다. 폭 350(시트 거터 안), 블록 간격 20.
// 출발일/도착일 칩(고르는 쪽 = brand-subtle + border/focus 1.5) → 월 이동(‹ "2026년 11월" ›, 40 버튼) → 요일(Caption 3차)
// → 7열 달력(칸 50×40, 주 간격 4: 범위 띠 bg/brand-subtle = primary/50 · 시작·종료 보라 원 36 + Label/M 흰 글자 · 범위 안 text/brand
//   · 오늘 = 아래 점 4 · 고를 수 없는 날(과거 등) = text/disabled) → 확인(Button Primary L FILL).
// 날짜 상태는 데이터로 그린다. 값은 'YYYY-MM-DD'. 키보드: ←→ 하루 · ↑↓ 한 주 · Home/End 주 처음·끝 · PageUp/PageDown 한 달.
export type SheetContentDateRangeCta = {
  /** 기본 "확인" */
  label?: ReactNode
  onClick?: () => void
  /** 기본: 출발일·도착일이 모두 있어야 켜진다 */
  disabled?: boolean
}

export type SheetContentDateRangeProps = DateRangeLimits & {
  /** 고른 기간. 둘 다 null이면 처음 상태 */
  value: DateRangeValue
  onChange: (value: DateRangeValue) => void
  /** 오늘(점 표시 · 기본 min). 서버 기준일을 넘기면 시간대 차이가 없다. 기본 기기 오늘 */
  today?: YmdDate
  /** Figma CTA: 하단 "확인". 객체를 주면 켜진다 — 시트 자체 CTA는 끄고 이것을 쓴다 */
  cta?: SheetContentDateRangeCta
  /** 칩 라벨. 기본 출발일 · 도착일 */
  startLabel?: string
  endLabel?: string
  className?: string
}

export function SheetContentDateRange({
  value,
  onChange,
  today: todayProp,
  min: minProp,
  max,
  endMin,
  maxDays,
  startLocked = false,
  cta,
  startLabel = '출발일',
  endLabel = '도착일',
  className,
}: SheetContentDateRangeProps) {
  const today = todayProp ?? localToday()
  const min = minProp ?? today
  const limits: DateRangeLimits = { min, max, endMin, maxDays, startLocked }

  const [field, setField] = useState<DateRangeField>(startLocked ? 'end' : 'start')
  const [month, setMonth] = useState(() => monthOf(value.start ?? value.end ?? today))
  const [focusDate, setFocusDate] = useState<YmdDate | null>(null)
  const moveFocus = useRef(false)
  const gridRef = useRef<HTMLDivElement>(null)
  const monthId = useId()

  const weeks = monthGrid(month)
  const inMonth = (d: YmdDate | null) => d !== null && monthOf(d) === month
  // 달력의 탭 멈춤 하나(roving tabindex): 키보드로 옮긴 날 → 출발일 → 오늘 → 1일
  const tabStop = [focusDate, value.start, value.end, today].find(inMonth) ?? month

  useEffect(() => {
    if (!moveFocus.current || !focusDate) return
    moveFocus.current = false
    gridRef.current?.querySelector<HTMLButtonElement>(`[data-date="${focusDate}"]`)?.focus()
  }, [focusDate, month])

  const choose = (d: YmdDate) => {
    if (!isDateSelectable(d, field, value, limits)) return
    const next = pickDate(d, field, value, limits)
    setField(next.field)
    setFocusDate(d)
    onChange(next.value)
  }

  const onGridKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    const from = (event.target as HTMLElement).dataset.date
    if (!from) return
    const weekday = new Date(`${from}T00:00:00Z`).getUTCDay()
    const step: Record<string, () => YmdDate> = {
      ArrowLeft: () => addDays(from, -1),
      ArrowRight: () => addDays(from, 1),
      ArrowUp: () => addDays(from, -7),
      ArrowDown: () => addDays(from, 7),
      Home: () => addDays(from, -weekday),
      End: () => addDays(from, 6 - weekday),
      PageUp: () => clampToMonth(from, -1),
      PageDown: () => clampToMonth(from, 1),
    }
    const to = step[event.key]?.()
    if (!to) return
    event.preventDefault()
    moveFocus.current = true
    setMonth(monthOf(to))
    setFocusDate(to)
  }

  const prevDisabled = month <= monthOf(min)
  const nextDisabled = max !== undefined && month >= monthOf(max)
  const done = value.start !== null && value.end !== null

  return (
    <div className={clsx('flex flex-col gap-5 bg-surface', className)}>
      <div className="flex gap-2">
        <RangeChip
          label={startLabel}
          date={value.start}
          active={field === 'start'}
          disabled={startLocked}
          onClick={() => setField('start')}
        />
        <RangeChip label={endLabel} date={value.end} active={field === 'end'} onClick={() => setField('end')} />
      </div>

      <div className="flex items-center justify-between">
        <IconButton size="m" icon="chevron-left" label="이전 달" disabled={prevDisabled} onClick={() => setMonth(addMonths(month, -1))} />
        <h3 id={monthId} aria-live="polite" className="text-h3 text-primary">
          {formatMonth(month)}
        </h3>
        <IconButton size="m" icon="chevron-right" label="다음 달" disabled={nextDisabled} onClick={() => setMonth(addMonths(month, 1))} />
      </div>

      <div ref={gridRef} role="grid" aria-labelledby={monthId} onKeyDown={onGridKeyDown} className="flex flex-col">
        <div role="row" className="flex">
          {DATE_RANGE_WEEKDAYS.map((w) => (
            <div key={w} role="columnheader" aria-label={`${w}요일`} className="flex h-5 flex-1 items-center justify-center text-caption text-tertiary">
              {w}
            </div>
          ))}
        </div>
        {/* 요일 줄과 달력 사이 20(블록 간격), 주 간격 4 */}
        <div className="mt-5 flex flex-col gap-1">
          {weeks.map((week, i) => (
            <div key={i} role="row" className="flex">
              {week.map((d, j) =>
                d === null ? (
                  <div key={j} role="gridcell" className="h-10 flex-1" />
                ) : (
                  <Day
                    key={d}
                    date={d}
                    value={value}
                    today={d === today}
                    selectable={isDateSelectable(d, field, value, limits)}
                    tabbable={d === tabStop}
                    onPick={choose}
                  />
                ),
              )}
            </div>
          ))}
        </div>
      </div>

      {cta && (
        <Button
          size="l"
          label={cta.label ?? '확인'}
          disabled={cta.disabled ?? !done}
          onClick={cta.onClick}
          className="w-full"
        />
      )}
    </div>
  )
}

/** PageUp/PageDown: 같은 날짜의 이전·다음 달(없으면 그 달 마지막 날) */
function clampToMonth(from: YmdDate, months: number): YmdDate {
  const target = addMonths(monthOf(from), months)
  const last = addDays(addMonths(target, 1), -1)
  const day = `${target.slice(0, 8)}${from.slice(8, 10)}`
  return day > last ? last : day
}

function RangeChip({
  label,
  date,
  active,
  disabled = false,
  onClick,
}: {
  label: string
  date: YmdDate | null
  active: boolean
  disabled?: boolean
  onClick: () => void
}) {
  return (
    <button
      type="button"
      aria-pressed={active}
      aria-label={`${label} ${date ? formatDateShort(date) : '날짜 선택'}`}
      disabled={disabled}
      onClick={onClick}
      className={clsx(
        'flex min-w-0 flex-1 flex-col items-start gap-0.5 rounded-md border-[1.5px] px-3.5 py-2.5 text-left transition-colors select-none',
        active ? 'border-focus bg-brand-subtle' : 'border-transparent bg-subtle',
        focusRing,
      )}
    >
      <span className={clsx('text-caption', active ? 'text-brand' : 'text-tertiary')}>{label}</span>
      <span className={clsx('truncate text-body-m-strong', date ? 'text-primary' : 'text-tertiary', disabled && 'text-secondary')}>
        {date ? formatDateShort(date) : '날짜 선택'}
      </span>
    </button>
  )
}

function Day({
  date,
  value,
  today,
  selectable,
  tabbable,
  onPick,
}: {
  date: YmdDate
  value: DateRangeValue
  today: boolean
  selectable: boolean
  tabbable: boolean
  onPick: (date: YmdDate) => void
}) {
  const { start, end } = value
  const isStart = date === start
  const isEnd = date === end
  const selected = isStart || isEnd
  const range = start !== null && end !== null && end > start
  const inside = range && date > start && date < end
  // 범위 띠: 안쪽 날은 칸 전체, 시작은 오른쪽 반, 끝은 왼쪽 반(주가 바뀌면 끊긴다)
  const band = inside ? 'inset-x-0' : range && isStart ? 'right-0 left-1/2' : range && isEnd ? 'right-1/2 left-0' : null
  const role = isStart && isEnd ? '출발일·도착일' : isStart ? '출발일' : isEnd ? '도착일' : null

  return (
    <div role="gridcell" aria-selected={selected || inside} className="relative h-10 flex-1">
      {band && <span aria-hidden className={clsx('absolute top-0.5 h-9 bg-brand-subtle', band)} />}
      <button
        type="button"
        data-date={date}
        tabIndex={tabbable ? 0 : -1}
        aria-disabled={!selectable || undefined}
        aria-current={today ? 'date' : undefined}
        aria-label={[formatDateLong(date), role, today ? '오늘' : null].filter(Boolean).join(', ')}
        onClick={() => onPick(date)}
        className={clsx(
          'relative mx-auto flex size-10 items-center justify-center rounded-full select-none',
          focusRing,
          selectable ? 'cursor-pointer' : 'cursor-not-allowed',
        )}
      >
        {selected && <span aria-hidden className="absolute size-9 rounded-full bg-brand" />}
        <span
          className={clsx(
            'relative',
            selected
              ? 'text-label-m text-inverse'
              : clsx('text-body-m', !selectable ? 'text-disabled' : inside ? 'text-brand' : 'text-primary'),
          )}
        >
          {Number(date.slice(8, 10))}
        </span>
        {today && (
          <span aria-hidden className={clsx('absolute top-8 left-1/2 size-1 -translate-x-1/2 rounded-full', selected ? 'bg-surface' : 'bg-brand')} />
        )}
      </button>
    </div>
  )
}
