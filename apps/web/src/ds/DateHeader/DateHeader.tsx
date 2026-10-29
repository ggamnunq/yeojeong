import { clsx } from 'clsx'
import type { HTMLAttributes, ReactNode } from 'react'

// Figma DateHeader(세트 58:10144 · Default 24:8264 · Plain 58:10139, v1.6) · Style=Default/Plain + Total.
// 결제 내역 리스트·타임라인의 날짜 구분 헤더. 기본은 날짜 + n일차만.
// Default = bg/canvas 띠 + 보라 Day · 합계 Amount 글자. Plain = 배경 없음 · Day·합계 3차 Caption(하이파이 HF-18 기본).
export type DateHeaderStyle = 'default' | 'plain'

// Figma Style과 이름이 겹쳐 HTML style 속성은 받지 않는다(TimelineItem·Callout·Chip과 같은 규칙)
export type DateHeaderProps = Omit<HTMLAttributes<HTMLDivElement>, 'children' | 'style'> & {
  /** Figma Style. 기본 default(띠), 하이파이 결제내역은 plain */
  style?: DateHeaderStyle
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

export function DateHeader({ style = 'default', date, day, total = false, dailyTotal, className, ...rest }: DateHeaderProps) {
  const plain = style === 'plain'
  return (
    <div className={clsx('flex items-center gap-2 px-5 pt-4 pb-2', !plain && 'bg-canvas', className)} {...rest}>
      <h3 className="flex min-w-0 items-center gap-2">
        <span className="truncate text-label-m text-primary">{date}</span>
        {day != null && <span className={clsx('shrink-0 text-caption', plain ? 'text-tertiary' : 'text-brand')}>{day}</span>}
      </h3>
      {total && dailyTotal != null && (
        <span
          className={clsx(
            'ml-auto shrink-0 whitespace-nowrap',
            plain ? 'text-caption text-tertiary' : 'font-amount text-body-s font-medium text-secondary',
          )}
        >
          {dailyTotal}
        </span>
      )}
    </div>
  )
}
