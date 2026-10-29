import { fireEvent, render, screen } from '@testing-library/react'
import { useState } from 'react'
import { describe, expect, it, vi } from 'vitest'
import { SheetContentDateTime, type SheetContentDateTimeProps } from './DateTime'
import {
  dateTimeDraft,
  dateTimeIso,
  dateTimeLimits,
  dateTimeProblem,
  formatDateTimeValue,
  isDateTimeDaySelectable,
  kstParts,
  timeDigits,
  type DateTimeDraft,
} from './rules'

// 지금 = 2026-11-13(금) 15:15 KST
const NOW = Date.parse('2026-11-13T15:15:00+09:00')
const LIMITS = dateTimeLimits(NOW)

describe('DateTime 규칙(KST)', () => {
  it('kstParts는 기기 시간대와 무관하게 KST 벽시계', () => {
    expect(kstParts(Date.parse('2026-11-13T23:30:00Z'))).toEqual({ date: '2026-11-14', hour: '08', minute: '30' })
  })

  it('기본 범위 = [지금 − 365일, 지금 + 5분]', () => {
    expect(LIMITS.max - NOW).toBe(5 * 60_000)
    expect(NOW - LIMITS.min).toBe(365 * 86_400_000)
    expect(kstParts(LIMITS.min).date).toBe('2025-11-13')
  })

  it('dateTimeDraft: null이면 지금, ISO면 그 시점(KST)', () => {
    expect(dateTimeDraft(null, NOW)).toEqual({ date: '2026-11-13', hour: '15', minute: '15' })
    expect(dateTimeDraft('2026-11-12T00:05:00Z', NOW)).toEqual({ date: '2026-11-12', hour: '09', minute: '05' })
  })

  it('dateTimeIso: KST ISO, 빈 칸·범위 밖 숫자는 null', () => {
    expect(dateTimeIso({ date: '2026-11-13', hour: '5', minute: '7' })).toBe('2026-11-13T05:07:00+09:00')
    expect(dateTimeIso({ date: '2026-11-13', hour: '', minute: '00' })).toBeNull()
    expect(dateTimeIso({ date: '2026-11-13', hour: '24', minute: '00' })).toBeNull()
    expect(dateTimeIso({ date: '2026-11-13', hour: '23', minute: '60' })).toBeNull()
  })

  it('날짜 선택 가능: 365일 전 날 ~ 지금+5분이 든 날', () => {
    expect(isDateTimeDaySelectable('2026-11-13', LIMITS)).toBe(true)
    expect(isDateTimeDaySelectable('2026-11-14', LIMITS)).toBe(false)
    expect(isDateTimeDaySelectable('2025-11-13', LIMITS)).toBe(true)
    expect(isDateTimeDaySelectable('2025-11-12', LIMITS)).toBe(false)
    // 23:57이면 지금+5분이 다음 날이라 다음 날도 고를 수 있다
    expect(isDateTimeDaySelectable('2026-11-14', dateTimeLimits(Date.parse('2026-11-13T23:57:00+09:00')))).toBe(true)
  })

  it('dateTimeProblem: 오늘이면 지금+5분까지만, 365일 전 날은 그 시각 이후만', () => {
    const today = (hour: string, minute: string): DateTimeDraft => ({ date: '2026-11-13', hour, minute })
    expect(dateTimeProblem(today('15', '20'), LIMITS)).toBeNull()
    expect(dateTimeProblem(today('15', '21'), LIMITS)).toBe('range')
    expect(dateTimeProblem(today('15', ''), LIMITS)).toBe('incomplete')
    expect(dateTimeProblem({ date: '2025-11-13', hour: '15', minute: '14' }, LIMITS)).toBe('range')
    expect(dateTimeProblem({ date: '2025-11-13', hour: '15', minute: '15' }, LIMITS)).toBeNull()
    expect(dateTimeProblem({ date: '2026-11-14', hour: '00', minute: '00' }, LIMITS)).toBe('range')
    // Mode=Date는 날짜만 본다
    expect(dateTimeProblem(today('23', ''), LIMITS, 'date')).toBeNull()
  })

  it('formatDateTimeValue: null = "지금", 고르면 "11.13 15:20"', () => {
    expect(formatDateTimeValue(null)).toBe('지금')
    expect(formatDateTimeValue('2026-11-13T15:20:00+09:00')).toBe('11.13 15:20')
    expect(formatDateTimeValue('2026-01-05T00:00:00Z')).toBe('01.05 09:00')
  })

  it('timeDigits: 숫자만 최대 2자리', () => {
    expect(timeDigits('1a5')).toBe('15')
    expect(timeDigits('123')).toBe('12')
  })
})

function Harness({ initial, onValue, ...rest }: { initial: DateTimeDraft; onValue?: (v: DateTimeDraft) => void } & Partial<SheetContentDateTimeProps>) {
  const [value, setValue] = useState(initial)
  return (
    <SheetContentDateTime
      value={value}
      onChange={(v) => {
        setValue(v)
        onValue?.(v)
      }}
      now={NOW}
      {...rest}
    />
  )
}

const day = (n: number) => screen.getByRole('button', { name: new RegExp(`^2026년 11월 ${n}일 `) })
const confirm = () => screen.getByRole('button', { name: '확인' }) as HTMLButtonElement

describe('SheetContentDateTime', () => {
  it('Figma 기본: 이번 달 · 13일 선택(보라 원) · 14일부터 흐림 · › 비활성 · 시 15 : 분 20 · 확인 켜짐', () => {
    render(<Harness initial={{ date: '2026-11-13', hour: '15', minute: '20' }} cta={{}} />)
    expect(screen.getByRole('heading', { name: '2026년 11월' })).toBeTruthy()
    expect(day(13).closest('[role="gridcell"]')?.getAttribute('aria-selected')).toBe('true')
    expect(day(13).getAttribute('aria-current')).toBe('date')
    expect(day(14).getAttribute('aria-disabled')).toBe('true')
    expect(day(12).getAttribute('aria-disabled')).toBeNull()
    expect((screen.getByRole('button', { name: '다음 달' }) as HTMLButtonElement).disabled).toBe(true)
    expect((screen.getByRole('button', { name: '이전 달' }) as HTMLButtonElement).disabled).toBe(false)
    expect((screen.getByRole('textbox', { name: '시' }) as HTMLInputElement).value).toBe('15')
    expect((screen.getByRole('textbox', { name: '분' }) as HTMLInputElement).value).toBe('20')
    expect(screen.getByRole('group', { name: '시각' })).toBeTruthy()
    expect(confirm().disabled).toBe(false)
  })

  it('흐린 날은 눌러도 바뀌지 않고, 고를 수 있는 날은 바뀐다', () => {
    const onValue = vi.fn()
    render(<Harness initial={{ date: '2026-11-13', hour: '15', minute: '20' }} onValue={onValue} />)
    fireEvent.click(day(20))
    expect(onValue).not.toHaveBeenCalled()
    fireEvent.click(day(2))
    expect(onValue).toHaveBeenLastCalledWith({ date: '2026-11-02', hour: '15', minute: '20' })
    expect(day(2).closest('[role="gridcell"]')?.getAttribute('aria-selected')).toBe('true')
  })

  it('365일 전 달에서는 ‹ 비활성, 그 날 이전은 흐림', () => {
    render(<Harness initial={{ date: '2025-11-20', hour: '09', minute: '00' }} />)
    expect(screen.getByRole('heading', { name: '2025년 11월' })).toBeTruthy()
    expect((screen.getByRole('button', { name: '이전 달' }) as HTMLButtonElement).disabled).toBe(true)
    expect(screen.getByRole('button', { name: /^2025년 11월 12일 / }).getAttribute('aria-disabled')).toBe('true')
    expect(screen.getByRole('button', { name: /^2025년 11월 13일 / }).getAttribute('aria-disabled')).toBeNull()
  })

  it('시를 2자리 치면 분 칸으로 넘어가고, 1자리로 떠나면 앞에 0', () => {
    render(<Harness initial={{ date: '2026-11-12', hour: '15', minute: '20' }} />)
    const hour = screen.getByRole('textbox', { name: '시' }) as HTMLInputElement
    const minute = screen.getByRole('textbox', { name: '분' }) as HTMLInputElement
    expect(hour.getAttribute('inputmode')).toBe('numeric')
    hour.focus()
    fireEvent.change(hour, { target: { value: '0' } })
    expect(document.activeElement).toBe(hour)
    fireEvent.change(hour, { target: { value: '09' } })
    expect(document.activeElement).toBe(minute)
    fireEvent.change(minute, { target: { value: '5' } })
    fireEvent.blur(minute)
    expect(minute.value).toBe('05')
    fireEvent.change(minute, { target: { value: '4x' } })
    expect(minute.value).toBe('4')
  })

  it('오늘 + 지금+5분 넘는 시각 → 시각 칸 aria-invalid · 확인 비활성, 고치면 다시 켜짐', () => {
    const onClick = vi.fn()
    render(<Harness initial={{ date: '2026-11-13', hour: '15', minute: '20' }} cta={{ onClick }} />)
    const minute = screen.getByRole('textbox', { name: '분' })
    fireEvent.change(minute, { target: { value: '21' } })
    expect(confirm().disabled).toBe(true)
    expect(minute.getAttribute('aria-invalid')).toBe('true')
    // 어제로 옮기면 같은 시각도 괜찮다
    fireEvent.click(day(12))
    expect(confirm().disabled).toBe(false)
    expect(minute.getAttribute('aria-invalid')).toBeNull()
    fireEvent.click(confirm())
    expect(onClick).toHaveBeenCalledTimes(1)
  })

  it('시·분이 비면 확인 비활성(칸은 빨갛게 하지 않음)', () => {
    render(<Harness initial={{ date: '2026-11-12', hour: '15', minute: '20' }} cta={{}} />)
    const hour = screen.getByRole('textbox', { name: '시' })
    fireEvent.change(hour, { target: { value: '' } })
    expect(confirm().disabled).toBe(true)
    expect(hour.getAttribute('aria-invalid')).toBeNull()
  })

  it('mode="date"면 시각 칸이 없고 날짜만 본다 · cta 라벨 바꾸기', () => {
    render(<Harness mode="date" initial={{ date: '2026-11-13', hour: '23', minute: '59' }} cta={{ label: '완료' }} />)
    expect(screen.queryByRole('textbox')).toBeNull()
    expect((screen.getByRole('button', { name: '완료' }) as HTMLButtonElement).disabled).toBe(false)
  })

  it('cta가 없으면 버튼이 없다(Figma CTA off)', () => {
    render(<Harness initial={{ date: '2026-11-13', hour: '15', minute: '20' }} />)
    expect(screen.queryByRole('button', { name: '확인' })).toBeNull()
  })

  it('키보드: ←는 하루 전으로 포커스, 범위 끝 달 밖으로는 나가지 않는다', () => {
    render(<Harness initial={{ date: '2026-11-13', hour: '15', minute: '20' }} />)
    day(13).focus()
    fireEvent.keyDown(day(13), { key: 'ArrowLeft' })
    expect(document.activeElement).toBe(day(12))
    fireEvent.keyDown(day(12), { key: 'PageDown' })
    expect(screen.getByRole('heading', { name: '2026년 11월' })).toBeTruthy()
  })

  it('min · max prop으로 범위를 바꾼다', () => {
    render(
      <Harness
        initial={{ date: '2026-11-13', hour: '10', minute: '00' }}
        min={Date.parse('2026-11-10T00:00:00+09:00')}
        max={Date.parse('2026-11-20T23:59:00+09:00')}
        cta={{}}
      />,
    )
    expect(day(9).getAttribute('aria-disabled')).toBe('true')
    expect(day(20).getAttribute('aria-disabled')).toBeNull()
    expect((screen.getByRole('button', { name: '이전 달' }) as HTMLButtonElement).disabled).toBe(true)
  })
})
