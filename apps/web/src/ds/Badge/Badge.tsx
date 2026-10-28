import { clsx } from 'clsx'
import type { HTMLAttributes, ReactNode } from 'react'

// Figma Badge(24:6998) · Status × Size. 여정 상태 표시.
export type BadgeStatus = 'upcoming' | 'active' | 'ended'
export type BadgeSize = 'm' | 's'

export type BadgeProps = Omit<HTMLAttributes<HTMLSpanElement>, 'children'> & {
  status: BadgeStatus
  size?: BadgeSize
  /** 기본 문구(시작 전·진행 중·종료) 대신 D-3 같은 문구를 쓸 때 */
  label?: ReactNode
  children?: never
}

const STATUS: Record<BadgeStatus, { label: string; color: string; dot: string }> = {
  upcoming: { label: '시작 전', color: 'bg-trip-upcoming-bg text-trip-upcoming-fg', dot: 'bg-trip-upcoming-dot' },
  active: { label: '진행 중', color: 'bg-trip-active-bg text-trip-active-fg', dot: 'bg-trip-active-dot' },
  ended: { label: '종료', color: 'bg-trip-ended-bg text-trip-ended-fg', dot: 'bg-trip-ended-dot' },
}

// S는 Figma에서 11px(텍스트 스타일 없음)이다
const SIZE = {
  m: { box: 'h-7 pr-3 pl-2.5 text-label-s', dot: 'size-2' },
  s: { box: 'h-5.5 pr-2 pl-1.75 text-[11px] leading-4 font-medium', dot: 'size-1.5' },
} as const

export function Badge({ status, size = 'm', label, className, ...rest }: BadgeProps) {
  const st = STATUS[status]
  return (
    <span
      className={clsx(
        'inline-flex shrink-0 items-center gap-1.5 rounded-full whitespace-nowrap',
        SIZE[size].box,
        st.color,
        className,
      )}
      {...rest}
    >
      <span aria-hidden className={clsx('shrink-0 rounded-full', SIZE[size].dot, st.dot)} />
      {label ?? st.label}
    </span>
  )
}
