import { clsx } from 'clsx'
import type { HTMLAttributes } from 'react'
import { Avatar } from '../Avatar/Avatar'
import type { AvatarPerson } from '../Avatar/rules'
import { avatarStackLabel, avatarStackLayout } from './rules'

// Figma AvatarStack(24:7268) · Count=2/3/4/5+(people 개수로 정해진다) × Size + Overflow
// 공동 결제의 부담 인원·여정 참여자 요약. people 순서 = 나 먼저 → 가입 순(spec 7-2).
export type AvatarStackSize = 'm' | 's' | 'xs'

export type AvatarStackProps = Omit<HTMLAttributes<HTMLSpanElement>, 'children'> & {
  /** 나 먼저 → 가입 순. 4명까지 보이고 나머지는 "+N" */
  people: readonly AvatarPerson[]
  size?: AvatarStackSize
  /** Figma Overflow: 5명 이상일 때 "+N" 칩. 끄면 4명까지만 그린다 */
  overflow?: boolean
  /** 접근성 이름. 기본 "나, 민지 외 2명" */
  label?: string
  children?: never
}

// 겹침 −6(XS·S) / −8(M). +N 칩 글자: M = Label/S(12px), S = 11px, XS = 9px(Figma에 텍스트 스타일 없음)
// Figma XS는 4번째 아바타가 칩 왼쪽을 덮어 "+"가 잘린다(−2처럼 보임). 덮이는 만큼 글자를 오른쪽으로 민다.
const SIZE = {
  xs: { overlap: '-mr-1.5', chip: 'size-5 pl-1.5 text-[9px] leading-3 font-medium' },
  s: { overlap: '-mr-1.5', chip: 'size-7 pl-1 text-[11px] leading-4 font-medium' },
  m: { overlap: '-mr-2', chip: 'size-9 text-label-s' },
} satisfies Record<AvatarStackSize, { overlap: string; chip: string }>

export function AvatarStack({ people, size = 'xs', overflow = true, label, className, ...rest }: AvatarStackProps) {
  const { shown, rest: more } = avatarStackLayout(people.length, overflow)
  const s = SIZE[size]
  const items = people.slice(0, shown)

  // 왼쪽 사람이 위에 오도록 DOM은 오른쪽부터 쌓고 flex-row-reverse로 뒤집는다(나중 형제가 위에 그려진다).
  return (
    <span
      role="img"
      aria-label={label ?? avatarStackLabel(people)}
      className={clsx('inline-flex shrink-0 flex-row-reverse items-center justify-end', className)}
      {...rest}
    >
      {more > 0 && (
        <span
          className={clsx(
            'inline-flex shrink-0 items-center justify-center rounded-full bg-muted text-secondary ring-[1.5px] ring-bg-surface',
            s.chip,
          )}
        >
          +{more}
        </span>
      )}
      {items
        .map((person, i) => (
          <Avatar
            key={`${i}-${person.name}`}
            {...person}
            size={size}
            ring
            alt=""
            className={clsx((i < items.length - 1 || more > 0) && s.overlap)}
          />
        ))
        .reverse()}
    </span>
  )
}
