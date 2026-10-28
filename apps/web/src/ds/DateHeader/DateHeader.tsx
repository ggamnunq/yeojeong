import { clsx } from 'clsx'
import type { HTMLAttributes, ReactNode } from 'react'

// Figma DateHeader(24:8264) + Total. 결제 내역 리스트·타임라인의 날짜 구분 헤더. 기본은 날짜 + n일차만.
export type DateHeaderProps = Omit<HTMLAttributes<HTMLDivElement>, 'children'> & {
  /** Figma date: "10월 28일 (화)" */
  date: ReactNode
  /** Figma day: "2일차" */
  day?: ReactNode
  /** Figma Total: 일자 합계를 보일지(기본 false) */
  total?: boolean
  /** Figma daily total: "₩184,200" / "공동 ₩143,950" */
  dailyTotal?: ReactNode
  children?: never
}

export function DateHeader({ date, day, total = false, dailyTotal, className, ...rest }: DateHeaderProps) {
  return (
    <div className={clsx('flex items-center gap-2 bg-canvas px-5 pt-4 pb-2', className)} {...rest}>
      <h3 className="flex min-w-0 items-center gap-2">
        <span className="truncate text-label-m text-primary">{date}</span>
        {day != null && <span className="shrink-0 text-caption text-brand">{day}</span>}
      </h3>
      {total && dailyTotal != null && (
        <span className="ml-auto shrink-0 font-amount text-body-s font-medium whitespace-nowrap text-secondary">{dailyTotal}</span>
      )}
    </div>
  )
}
