import type { SVGProps } from 'react'
import { ICON_VIEWBOX, ICONS, iconStrokeWidth, type IconName } from './icons'

// spec §6(v1.5) 박스 크기: 헤더·하단 내비·IconButton L/M = 24 / 버튼 L·M·리스트·입력·토스트·콜아웃 = 20 / 행 메타(버튼 S·태그·동의 행 ›·범례) = 16(태그 12~14)
export type IconSize = 12 | 14 | 16 | 20 | 24

export type IconProps = Omit<SVGProps<SVGSVGElement>, 'name' | 'ref'> & {
  name: IconName
  /** 박스 크기(px). 그림은 박스를 Figma처럼 75~85% 채우고(ICON_VIEWBOX), 선은 크기/16 px */
  size?: IconSize
  /** 의미가 있는 아이콘이면 읽어 줄 이름. 없으면 장식으로 보고 스크린리더에서 숨긴다. */
  label?: string
}

export function Icon({ name, size = 24, label, ...rest }: IconProps) {
  const Glyph = ICONS[name]
  const [x, y, v] = ICON_VIEWBOX[name] ?? [0, 0, 24]
  return (
    <Glyph
      size={size}
      viewBox={`${x} ${y} ${v} ${v}`}
      strokeWidth={iconStrokeWidth(v)}
      aria-hidden={label ? undefined : true}
      aria-label={label}
      role={label ? 'img' : undefined}
      focusable="false"
      {...rest}
    />
  )
}
