import { clsx } from 'clsx'
import type { HTMLAttributes } from 'react'

// Figma Badge/Me(24:61291) · "나" 배지. 이름이 보이는 행에서 이름 옆에 둔다(프사 Me 테두리와 함께).
// SettlementRow · Row/MemberAmount · Row/Member가 같이 쓴다. 색(Me 테두리)만으로 "나"를 전하지 않도록 글자로 붙인다(spec 7-2).
export type BadgeMeProps = Omit<HTMLAttributes<HTMLSpanElement>, 'children'> & { children?: never }

export function BadgeMe({ className, ...rest }: BadgeMeProps) {
  return (
    <span
      className={clsx('inline-flex shrink-0 items-center rounded-xs bg-brand-subtle px-1.5 py-px text-label-s text-brand', className)}
      {...rest}
    >
      나
    </span>
  )
}
