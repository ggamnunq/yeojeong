import type { SVGProps } from 'react'
import { ICON_STROKE_WIDTH, ICONS, type IconName } from './icons'

export type IconSize = 12 | 14 | 16 | 20 | 24

export type IconProps = Omit<SVGProps<SVGSVGElement>, 'name' | 'ref'> & {
  name: IconName
  size?: IconSize
  /** 의미가 있는 아이콘이면 읽어 줄 이름. 없으면 장식으로 보고 스크린리더에서 숨긴다. */
  label?: string
}

export function Icon({ name, size = 24, label, ...rest }: IconProps) {
  const Glyph = ICONS[name]
  return (
    <Glyph
      size={size}
      strokeWidth={ICON_STROKE_WIDTH}
      aria-hidden={label ? undefined : true}
      aria-label={label}
      role={label ? 'img' : undefined}
      focusable="false"
      {...rest}
    />
  )
}
