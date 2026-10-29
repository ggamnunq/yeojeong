import { clsx } from 'clsx'
import type { HTMLAttributes, ReactNode } from 'react'
import { Icon } from '../Icon/Icon'
import type { IconName } from '../Icon/icons'

// Figma Tag(24:7086) · Type × Size. 비대화형 라벨. Shared는 레거시(공동 결제는 AvatarStack). Changed는 v1.4(미확정과 같은 중립 회색).
// v1.7: Pending의 Label(TEXT, 기본 "미확정") — Row/Pick chip 등에서 `label`로 "추가됨" · "취소됨" · "비슷한 기록"을 넣는다(같은 회색 칩).
// Warning(v1.6.2 · M 70:10539 · S 70:10544) = "연결 만료" — HF-30 마이페이지 지갑 줄 오른쪽. 옅은 warning 면 + 진한 warning 글자, 아이콘 없음.
export type TagType = 'shared' | 'personal' | 'pending' | 'duplicate' | 'refund' | 'left' | 'changed' | 'warning'
export type TagSize = 'm' | 's'

export type TagProps = Omit<HTMLAttributes<HTMLSpanElement>, 'children'> & {
  type: TagType
  size?: TagSize
  /** Figma Label(v1.7, Pending): 기본 문구(공동·개인·미확정·중복 의심·환불·나간 멤버·변경됨·연결 만료)를 바꿀 때. 예: type="pending" label="추가됨" */
  label?: ReactNode
  children?: never
}

const TYPE: Record<TagType, { icon: IconName | null; label: string; color: string }> = {
  shared: { icon: 'users', label: '공동', color: 'bg-expense-shared-bg text-expense-shared-fg' },
  personal: { icon: 'lock', label: '개인', color: 'bg-expense-personal-bg text-expense-personal-fg' },
  pending: { icon: null, label: '미확정', color: 'bg-expense-pending-bg text-expense-pending-fg' },
  duplicate: { icon: 'copy', label: '중복 의심', color: 'bg-feedback-error-bg text-feedback-error-fg' },
  refund: { icon: 'refresh', label: '환불', color: 'bg-feedback-info-bg text-feedback-info-fg' },
  left: { icon: 'logout', label: '나간 멤버', color: 'bg-muted text-secondary' },
  changed: { icon: null, label: '변경됨', color: 'bg-expense-pending-bg text-expense-pending-fg' },
  warning: { icon: null, label: '연결 만료', color: 'bg-feedback-warning-bg text-feedback-warning-fg' },
}

// S는 Figma에서 11px(텍스트 스타일 없음)이다
const SIZE = {
  m: { box: 'h-6.5 pr-2 pl-1.5 text-label-s', plain: 'h-5 px-1.75 text-label-s', icon: 14 },
  s: { box: 'h-5 pr-1.5 pl-1.25 text-[11px] leading-4 font-medium', plain: 'h-4.5 px-1.5 text-[11px] leading-3.5 font-medium', icon: 12 },
} as const

export function Tag({ type, size = 'm', label, className, ...rest }: TagProps) {
  const t = TYPE[type]
  const s = SIZE[size]
  return (
    <span
      className={clsx(
        'inline-flex shrink-0 items-center gap-0.75 rounded-xs whitespace-nowrap',
        t.icon ? s.box : s.plain,
        t.color,
        className,
      )}
      {...rest}
    >
      {t.icon && <Icon name={t.icon} size={s.icon} className="shrink-0" />}
      {label ?? t.label}
    </span>
  )
}
