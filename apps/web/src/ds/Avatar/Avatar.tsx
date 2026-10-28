import { clsx } from 'clsx'
import { useState, type HTMLAttributes } from 'react'
import {
  avatarColorByJoinOrder,
  avatarInitial,
  avatarLabel,
  resolveAvatarSource,
  type AvatarColor,
  type AvatarPerson,
  type AvatarSize,
} from './rules'
// Figma Avatar/DefaultImage Color=Gray(24:32461)를 SVG로 내보낸 것. CSP(img-src 'self' data:)에 맞게 data URI로 싣는다.
import defaultImage from './default-image.svg?inline'

// Figma Avatar(24:7235) · Color × Size × Source + Ring/Me/Left
// 프사 규칙(spec 7-2): 사진(카카오) → 없으면 「여정」 기본 이미지(회색) → 사진 로딩 실패면 이니셜.
// Color=Violet|Sunset, Source=Default(레거시 기본 이미지)는 만들지 않았다.
export type AvatarProps = Omit<HTMLAttributes<HTMLSpanElement>, 'children' | 'color'> &
  AvatarPerson & {
    size?: AvatarSize
    /** Figma Ring: 흰 바깥 테두리(스택에서 겹칠 때). XS·S·M 1.5px, L·XL 2px */
    ring?: boolean
    /** 접근성 이름. 기본 "민지" · "민지 (나)" · "민지 (나간 멤버)". 바로 옆에 이름이 보이면 ""로 장식 처리한다 */
    alt?: string
    children?: never
  }

const COLOR = {
  violet: 'bg-primary-100 text-primary-700',
  sunset: 'bg-sunset-100 text-sunset-700',
  green: 'bg-success-50 text-success-700',
  blue: 'bg-info-50 text-info-700',
  amber: 'bg-warning-50 text-warning-700',
  gray: 'bg-neutral-200 text-neutral-700',
} satisfies Record<AvatarColor, string>

// 이니셜 글자: S·M·L은 Label/S·Label/M·Heading/H3와 같다. XS(10px)·XL(24px)은 Figma에 텍스트 스타일이 없다.
const SIZE = {
  xs: { box: 'size-5', text: 'text-[10px] leading-none font-medium', ring: 'ring-[1.5px]' },
  s: { box: 'size-7', text: 'text-label-s', ring: 'ring-[1.5px]' },
  m: { box: 'size-9', text: 'text-label-m', ring: 'ring-[1.5px]' },
  l: { box: 'size-12', text: 'text-h3', ring: 'ring-2' },
  xl: { box: 'size-16', text: 'text-[24px] leading-none font-bold', ring: 'ring-2' },
} satisfies Record<AvatarSize, { box: string; text: string; ring: string }>

export function Avatar({
  name,
  src,
  source,
  color,
  joinOrder,
  size = 'm',
  ring = false,
  me = false,
  left = false,
  initial,
  alt,
  className,
  ...rest
}: AvatarProps) {
  // 못 불러온 URL을 기억한다. src가 바뀌면 다시 사진을 시도한다.
  const [failedSrc, setFailedSrc] = useState<string | null>(null)
  const shown = resolveAvatarSource({ source, src, failed: !!src && failedSrc === src })
  const tone = color ?? (joinOrder === undefined ? 'gray' : avatarColorByJoinOrder(joinOrder))
  const label = alt ?? avatarLabel({ name, me, left })
  const s = SIZE[size]

  return (
    <span
      role={label ? 'img' : undefined}
      aria-label={label || undefined}
      aria-hidden={label ? undefined : true}
      data-source={shown}
      className={clsx('relative inline-flex shrink-0 rounded-full select-none', s.box, ring && ['ring-bg-surface', s.ring], className)}
      {...rest}
    >
      <span
        className={clsx(
          'absolute inset-0 grid place-items-center overflow-hidden rounded-full',
          shown === 'initial' && [COLOR[tone], s.text],
          shown === 'photo' && 'bg-neutral-200',
          shown === 'default' && 'bg-neutral-100',
          left && 'grayscale',
        )}
      >
        {shown === 'photo' && src && (
          <img
            src={src}
            alt=""
            draggable={false}
            referrerPolicy="no-referrer"
            className="size-full object-cover"
            onError={() => setFailedSrc(src)}
          />
        )}
        {shown === 'default' && <img src={defaultImage} alt="" draggable={false} className="size-full" />}
        {shown === 'initial' && (initial ?? avatarInitial(name))}
      </span>
      {left && <span className="absolute inset-0 rounded-full bg-surface/60" />}
      {me && <span className="absolute inset-0 rounded-full border-2 border-focus" />}
    </span>
  )
}
