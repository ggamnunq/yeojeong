import { fireEvent, render, screen } from '@testing-library/react'
import { useState } from 'react'
import { describe, expect, it, vi } from 'vitest'
import { SheetContentDateRange, type SheetContentDateRangeProps } from './DateRange'
import {
  addDays,
  addMonths,
  formatDateLong,
  formatDateRange,
  formatDateShort,
  isDateSelectable,
  monthGrid,
  pickDate,
  type DateRangeValue,
} from './rules'

describe('DateRange rules', () => {
  it('날짜 계산은 시간대와 무관한 달력 날짜다', () => {
    expect(addDays('2026-11-30', 1)).toBe('2026-12-01')
    expect(addDays('2026-03-01', -1)).toBe('2026-02-28')
    expect(addMonths('2026-12-01', 1)).toBe('2027-01-01')
    expect(addMonths('2026-01-01', -1)).toBe('2025-12-01')
  })

  it('monthGrid: 일요일 시작 7열, 앞뒤 빈 칸 null', () => {
    const nov = monthGrid('2026-11-01') // 2026-11-01 = 일요일
    expect(nov).toHaveLength(5)
    expect(nov[0][0]).toBe('2026-11-01')
    expect(nov[4].slice(0, 2)).toEqual(['2026-11-29', '2026-11-30'])
    expect(nov[4][2]).toBeNull()
    const dec = monthGrid('2026-12-01') // 화요일 시작
    expect(dec[0].slice(0, 3)).toEqual([null, null, '2026-12-01'])
  })

  it('표기: 칩 "11.12 (목)" · Picker "11.12 (목) – 11.15 (일)" · 스크린리더 긴 날짜', () => {
    expect(formatDateShort('2026-11-12')).toBe('11.12 (목)')
    expect(formatDateShort('2026-11-05')).toBe('11.05 (목)')
    expect(formatDateRange({ start: '2026-11-12', end: '2026-11-15' })).toBe('11.12 (목) – 11.15 (일)')
    expect(formatDateRange({ start: '2026-11-12', end: null })).toBeNull()
    expect(formatDateLong('2026-11-12')).toBe('2026년 11월 12일 목요일')
  })

  it('isDateSelectable: min·max · 도착일 하한 · 최대 일수 · 출발일 고정', () => {
    const value: DateRangeValue = { start: '2026-11-12', end: null }
    expect(isDateSelectable('2026-11-04', 'start', value, { min: '2026-11-05' })).toBe(false)
    expect(isDateSelectable('2026-11-05', 'start', value, { min: '2026-11-05' })).toBe(true)
    expect(isDateSelectable('2026-11-18', 'end', value, { maxDays: 7 })).toBe(true)
    expect(isDateSelectable('2026-11-19', 'end', value, { maxDays: 7 })).toBe(false)
    expect(isDateSelectable('2026-11-13', 'end', value, { endMin: '2026-11-14' })).toBe(false)
    // 도착일을 고르는 중 출발일 앞 = 새 출발일(고정이면 불가)
    expect(isDateSelectable('2026-11-10', 'end', value, {})).toBe(true)
    expect(isDateSelectable('2026-11-10', 'end', value, { startLocked: true })).toBe(false)
    expect(isDateSelectable('2026-11-20', 'start', value, { startLocked: true })).toBe(false)
  })

  it('pickDate: 출발일 → 도착일 칩으로 넘어가고, 앞을 누르면 출발일을 새로 고른다', () => {
    const empty = { start: null, end: null }
    expect(pickDate('2026-11-12', 'start', empty)).toEqual({ value: { start: '2026-11-12', end: null }, field: 'end' })
    expect(pickDate('2026-11-15', 'end', { start: '2026-11-12', end: null })).toEqual({
      value: { start: '2026-11-12', end: '2026-11-15' },
      field: 'end',
    })
    expect(pickDate('2026-11-10', 'end', { start: '2026-11-12', end: '2026-11-15' })).toEqual({
      value: { start: '2026-11-10', end: '2026-11-15' },
      field: 'end',
    })
    // 새 출발일이 도착일보다 뒤거나 최대 일수를 넘기면 도착일을 비운다
    expect(pickDate('2026-11-20', 'start', { start: '2026-11-12', end: '2026-11-15' }).value).toEqual({ start: '2026-11-20', end: null })
    expect(pickDate('2026-11-01', 'start', { start: '2026-11-12', end: '2026-11-15' }, { maxDays: 7 }).value).toEqual({
      start: '2026-11-01',
      end: null,
    })
  })
})

function Harness(props: Partial<SheetContentDateRangeProps> & { initial?: DateRangeValue; onValue?: (v: DateRangeValue) => void }) {
  const { initial = { start: null, end: null }, onValue, ...rest } = props
  const [value, setValue] = useState(initial)
  return (
    <SheetContentDateRange
      today="2026-11-05"
      {...rest}
      value={value}
      onChange={(v) => {
        setValue(v)
        onValue?.(v)
      }}
    />
  )
}

const day = (label: RegExp) => screen.getByRole('button', { name: label })

describe('SheetContentDateRange', () => {
  it('월 제목 · 7열 grid · 오늘(aria-current) · 오늘 전은 고를 수 없다(aria-disabled)', () => {
    render(<Harness />)
    expect(screen.getByRole('grid', { name: '2026년 11월' })).toBeTruthy()
    expect(screen.getAllByRole('columnheader')).toHaveLength(7)
    expect(day(/^2026년 11월 5일 목요일, 오늘$/).getAttribute('aria-current')).toBe('date')
    expect(day(/11월 4일/).getAttribute('aria-disabled')).toBe('true')
  })

  it('출발일 → 도착일 순서로 누르면 범위가 되고, 칩·확인이 따라 바뀐다', () => {
    const onValue = vi.fn()
    const onConfirm = vi.fn()
    render(<Harness onValue={onValue} cta={{ onClick: onConfirm }} />)
    const confirm = screen.getByRole('button', { name: '확인' }) as HTMLButtonElement
    expect(confirm.disabled).toBe(true)
    expect(screen.getByRole('button', { name: /출발일/ }).getAttribute('aria-pressed')).toBe('true')

    fireEvent.click(day(/11월 12일/))
    expect(onValue).toHaveBeenLastCalledWith({ start: '2026-11-12', end: null })
    expect(screen.getByRole('button', { name: /도착일/ }).getAttribute('aria-pressed')).toBe('true')
    fireEvent.click(day(/11월 15일/))
    expect(onValue).toHaveBeenLastCalledWith({ start: '2026-11-12', end: '2026-11-15' })

    expect(screen.getByRole('button', { name: '출발일 11.12 (목)' })).toBeTruthy()
    expect(day(/11월 12일 목요일, 출발일/)).toBeTruthy()
    expect(day(/11월 15일 일요일, 도착일/)).toBeTruthy()
    expect(day(/11월 13일/).closest('[role=gridcell]')!.getAttribute('aria-selected')).toBe('true')
    expect(confirm.disabled).toBe(false)
    fireEvent.click(confirm)
    expect(onConfirm).toHaveBeenCalledTimes(1)
  })

  it('고를 수 없는 날을 눌러도 값이 바뀌지 않는다', () => {
    const onValue = vi.fn()
    render(<Harness onValue={onValue} />)
    fireEvent.click(day(/11월 3일/))
    expect(onValue).not.toHaveBeenCalled()
  })

  it('startLocked: 출발일 칩은 비활성, 도착일만 바꾼다(endMin · maxDays 적용)', () => {
    const onValue = vi.fn()
    render(
      <Harness
        initial={{ start: '2026-11-02', end: '2026-11-06' }}
        min="2026-10-01"
        endMin="2026-11-05"
        maxDays={7}
        startLocked
        onValue={onValue}
      />,
    )
    expect((screen.getByRole('button', { name: '출발일 11.02 (월)' }) as HTMLButtonElement).disabled).toBe(true)
    expect(day(/11월 4일/).getAttribute('aria-disabled')).toBe('true')
    expect(day(/11월 9일/).getAttribute('aria-disabled')).toBe('true')
    fireEvent.click(day(/11월 8일/))
    expect(onValue).toHaveBeenLastCalledWith({ start: '2026-11-02', end: '2026-11-08' })
  })

  it('월 이동: 이전 달은 min 달에서 막히고, 다음 달로 넘어간다', () => {
    render(<Harness />)
    expect((screen.getByRole('button', { name: '이전 달' }) as HTMLButtonElement).disabled).toBe(true)
    fireEvent.click(screen.getByRole('button', { name: '다음 달' }))
    expect(screen.getByRole('grid', { name: '2026년 12월' })).toBeTruthy()
  })

  it('키보드: 탭 멈춤은 하나(roving), 화살표로 날짜 이동 · 달이 바뀌면 따라 넘어간다', () => {
    render(<Harness initial={{ start: '2026-11-30', end: null }} />)
    const tabbable = screen.getAllByRole('button').filter((b) => b.dataset.date && b.tabIndex === 0)
    expect(tabbable.map((b) => b.dataset.date)).toEqual(['2026-11-30'])
    tabbable[0].focus()
    fireEvent.keyDown(tabbable[0], { key: 'ArrowRight' })
    expect(screen.getByRole('grid', { name: '2026년 12월' })).toBeTruthy()
    expect((document.activeElement as HTMLElement).dataset.date).toBe('2026-12-01')
    fireEvent.keyDown(document.activeElement!, { key: 'ArrowUp' })
    expect((document.activeElement as HTMLElement).dataset.date).toBe('2026-11-24')
  })
})
