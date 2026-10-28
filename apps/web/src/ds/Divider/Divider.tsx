import { clsx } from 'clsx'
import type { HTMLAttributes } from 'react'

// Figma Divider(24:8796) · Type=Full(화면 폭)/Inset(왼쪽 20 들여쓰기)/Thick(섹션 사이 8px)
export type DividerType = 'full' | 'inset' | 'thick'

export type DividerProps = Omit<HTMLAttributes<HTMLHRElement>, 'children'> & {
  type?: DividerType
}

const TYPE = {
  full: 'h-px bg-border-default',
  inset: 'ml-5 h-px bg-border-default',
  thick: 'h-2 bg-subtle',
} satisfies Record<DividerType, string>

export function Divider({ type = 'full', className, ...rest }: DividerProps) {
  return <hr className={clsx('shrink-0 border-0', TYPE[type], className)} {...rest} />
}
