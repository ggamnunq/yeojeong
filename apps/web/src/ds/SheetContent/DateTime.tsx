import { clsx } from 'clsx'
import { useEffect, useId, useRef, useState, type KeyboardEvent, type ReactNode, type Ref } from 'react'
import { Button } from '../Button/Button'
import { IconButton } from '../IconButton/IconButton'
import { focusRing } from '../styles'
import {
  addDays,
  addMonths,
  DATE_RANGE_WEEKDAYS,
  dateTimeLimits,
  dateTimeProblem,
  formatDateLong,
  formatMonth,
  isDateTimeDaySelectable,
  kstParts,
  monthGrid,
  monthOf,
  timeDigits,
  type DateTimeDraft,
  type SheetContentDateTimeMode,
  type YmdDate,
} from './rules'

// Figma SheetContent/DateTime(세트 117:15428, v1.7 · B-27) · Mode=DateTime(117:15184, 기본)/Date(117:15311) + CTA(BOOLEAN, "확인").
// 날짜·시각 선택 시트 내용(폭 350, 블록 간격 20). 시트는 BottomSheet leading="back" · close 끔 · cta 끔, 제목 "날짜"(HF-46d).
// month(‹ "2026년 11월" ›, 40 버튼) → weekdays(Caption 3차) → 7열 grid(칸 50×40, 주 간격 4 · 단일 선택 = 보라 원 36 + Label/M 흰 글자
// · 범위 밖 = text/disabled) → time(Mode=DateTime만: "시각" Body/M 2차 + 시 · 분 두 칸 56×44 bg/subtle Body/L, ":" 사이 6) → 확인(Button Primary L FILL).
// 범위: 지금 + 5분 이후 · 365일 이전은 흐림(선택 불가), 범위 양끝이 든 달에서 ‹ › 비활성. 선택일이 오늘이면 시각도 지금 + 5분까지만(넘으면 확인 비활성).
// 시각은 휠·네이티브 time 입력 대신 숫자 두 칸: inputmode="numeric" 2자리, 칸을 누르면 전체 선택, 시를 2자리 치면 분으로 이동, 1자리로 떠나면 앞에 0.
// 날짜·시각은 KST 벽시계. 값(DateTimeDraft)은 부모가 쥐고, 확인에서 dateTimeIso(value)로 ISO를 만든다.
export type SheetContentDateTimeCta = {
  /** 기본 "확인" */
  label?: ReactNode
  onClick?: () => void
  /** 기본: dateTimeProblem(value, 범위, mode)이 있으면 꺼진다 */
  disabled?: boolean
}

export type SheetContentDateTimeProps = {
  /** Figma Mode. date면 time 블록이 없다. 기본 datetime */
  mode?: SheetContentDateTimeMode
  /** 고르는 중인 값. 시트를 열 때 dateTimeDraft(현재 값 | null, now)로 채운다 */
  value: DateTimeDraft
  onChange: (value: DateTimeDraft) => void
  /** 지금(epoch ms). 범위 기준이고 테스트에서 고정한다. 기본: 처음 그릴 때의 Date.now() */
  now?: number
  /** 고를 수 있는 가장 이른 시점(epoch ms). 기본 now − 365일 */
  min?: number
  /** 고를 수 있는 가장 늦은 시점(epoch ms). 기본 now + 5분 */
  max?: number
  /** Figma CTA: 하단 "확인". 객체를 주면 켜진다 — 시트 자체 CTA는 끄고 이것을 쓴다 */
  cta?: SheetContentDateTimeCta
  className?: string
}

export function SheetContentDateTime({
  mode = 'datetime',
  value,
  onChange,
  now: nowProp,
  min: minProp,
  max: maxProp,
  cta,
  className,
}: SheetContentDateTimeProps) {
  const [mountedAt] = useState(() => Date.now())
  const now = nowProp ?? mountedAt
  const defaults = dateTimeLimits(now)
  const limits = { min: minProp ?? defaults.min, max: maxProp ?? defaults.max }
  const minDate = kstParts(limits.min).date
  const maxDate = kstParts(limits.max).date
  const today = kstParts(now).date
  const problem = dateTimeProblem(value, limits, mode)

  const [month, setMonth] = useState(() => monthOf(value.date))
  const [focusDate, setFocusDate] = useState<YmdDate | null>(null)
  const moveFocus = useRef(false)
  const gridRef = useRef<HTMLDivElement>(null)
  const minuteRef = useRef<HTMLInputElement>(null)
  const monthId = useId()
  const timeId = useId()

  const weeks = monthGrid(month)
  const inMonth = (d: YmdDate | null) => d !== null && monthOf(d) === month
  // 달력의 탭 멈춤 하나(roving tabindex): 키보드로 옮긴 날 → 고른 날 → 오늘 → 1일
  const tabStop = [focusDate, value.date, today].find(inMonth) ?? month

  useEffect(() => {
    if (!moveFocus.current || !focusDate) return
    moveFocus.current = false
    gridRef.current?.querySelector<HTMLButtonElement>(`[data-date="${focusDate}"]`)?.focus()
  }, [focusDate, month])

  const choose = (d: YmdDate) => {
    if (!isDateTimeDaySelectable(d, limits)) return
    setFocusDate(d)
    onChange({ ...value, date: d })
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
    let to = step[event.key]?.()
    if (!to) return
    event.preventDefault()
    // 범위 양끝 달 밖으로는 옮기지 않는다(‹ ›가 꺼진 달)
    if (monthOf(to) < monthOf(minDate) || monthOf(to) > monthOf(maxDate)) to = from
    moveFocus.current = true
    setMonth(monthOf(to))
    setFocusDate(to)
  }

  const prevDisabled = month <= monthOf(minDate)
  const nextDisabled = month >= monthOf(maxDate)
  // 시각 칸 테두리는 두 칸을 다 채웠는데 범위 밖일 때만(입력 중에는 빨갛게 하지 않는다)
  const timeInvalid = problem === 'range' && isDateTimeDaySelectable(value.date, limits)

  return (
    <div className={clsx('flex flex-col gap-5 bg-surface', className)}>
      <div className="flex items-center justify-between">
        <IconButton size="m" icon="chevron-left" label="이전 달" disabled={prevDisabled} onClick={() => setMonth(addMonths(month, -1))} />
        <h3 id={monthId} aria-live="polite" className="text-h3 text-primary">
          {formatMonth(month)}
        </h3>
        <IconButton size="m" icon="chevron-right" label="다음 달" disabled={nextDisabled} onClick={() => setMonth(addMonths(month, 1))} />
      </div>

      <div ref={gridRef} role="grid" aria-labelledby={monthId} onKeyDown={onGridKeyDown} className="flex flex-col gap-5">
        <div role="row" className="flex">
          {DATE_RANGE_WEEKDAYS.map((w) => (
            <div key={w} role="columnheader" aria-label={`${w}요일`} className="flex h-5 flex-1 items-center justify-center text-caption text-tertiary">
              {w}
            </div>
          ))}
        </div>
        <div className="flex flex-col gap-1">
          {weeks.map((week, i) => (
            <div key={i} role="row" className="flex">
              {week.map((d, j) =>
                d === null ? (
                  <div key={j} role="gridcell" className="h-10 flex-1" />
                ) : (
                  <Day
                    key={d}
                    date={d}
                    selected={d === value.date}
                    today={d === today}
                    selectable={isDateTimeDaySelectable(d, limits)}
                    tabbable={d === tabStop}
                    onPick={choose}
                  />
                ),
              )}
            </div>
          ))}
        </div>
      </div>

      {mode === 'datetime' && (
        <div className="flex h-13 items-center justify-between">
          <span id={timeId} className="text-body-m text-secondary">
            시각
          </span>
          <div role="group" aria-labelledby={timeId} className="flex items-center gap-1.5">
            <TimeField
              label="시"
              value={value.hour}
              invalid={timeInvalid}
              onChange={(hour) => {
                onChange({ ...value, hour })
                if (hour.length === 2) {
                  minuteRef.current?.focus()
                  minuteRef.current?.select()
                }
              }}
            />
            <span aria-hidden className="text-body-l text-secondary">
              :
            </span>
            <TimeField
              ref={minuteRef}
              label="분"
              value={value.minute}
              invalid={timeInvalid}
              onChange={(minute) => onChange({ ...value, minute })}
            />
          </div>
        </div>
      )}

      {cta && (
        <Button size="l" label={cta.label ?? '확인'} disabled={cta.disabled ?? problem !== null} onClick={cta.onClick} className="w-full" />
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

function TimeField({
  label,
  value,
  invalid,
  onChange,
  ref,
}: {
  label: string
  value: string
  invalid: boolean
  onChange: (digits: string) => void
  ref?: Ref<HTMLInputElement>
}) {
  return (
    <input
      ref={ref}
      type="text"
      inputMode="numeric"
      pattern="[0-9]*"
      maxLength={2}
      autoComplete="off"
      aria-label={label}
      aria-invalid={invalid || undefined}
      value={value}
      onChange={(e) => onChange(timeDigits(e.target.value))}
      // 칸을 누르면 전체 선택(바로 덮어쓰기)
      onFocus={(e) => e.currentTarget.select()}
      onClick={(e) => e.currentTarget.select()}
      // 1자리로 떠나면 앞에 0("5" → "05")
      onBlur={() => value.length === 1 && onChange(`0${value}`)}
      className={clsx(
        // Figma 칸 라운드 10은 토큰에 없는 원값이다
        'h-11 w-14 rounded-[10px] border-[1.5px] bg-subtle text-center text-body-l text-primary caret-brand outline-hidden transition-shadow',
        invalid ? 'border-error' : 'border-transparent focus:border-focus',
        'focus:shadow-focus-ring',
      )}
    />
  )
}

function Day({
  date,
  selected,
  today,
  selectable,
  tabbable,
  onPick,
}: {
  date: YmdDate
  selected: boolean
  today: boolean
  selectable: boolean
  tabbable: boolean
  onPick: (date: YmdDate) => void
}) {
  return (
    <div role="gridcell" aria-selected={selected} className="relative h-10 flex-1">
      <button
        type="button"
        data-date={date}
        tabIndex={tabbable ? 0 : -1}
        aria-disabled={!selectable || undefined}
        aria-current={today ? 'date' : undefined}
        aria-label={[formatDateLong(date), today ? '오늘' : null].filter(Boolean).join(', ')}
        onClick={() => onPick(date)}
        className={clsx(
          'relative mx-auto flex size-10 items-center justify-center rounded-full select-none',
          focusRing,
          selectable ? 'cursor-pointer' : 'cursor-not-allowed',
        )}
      >
        {selected && <span aria-hidden className="absolute size-9 rounded-full bg-brand" />}
        <span className={clsx('relative', selected ? 'text-label-m text-inverse' : clsx('text-body-m', selectable ? 'text-primary' : 'text-disabled'))}>
          {Number(date.slice(8, 10))}
        </span>
      </button>
    </div>
  )
}
