import { clsx } from 'clsx'
import type { HTMLAttributes, ReactNode } from 'react'
import { Avatar } from '../Avatar/Avatar'
import type { AvatarPerson } from '../Avatar/rules'
import { BadgeMe } from '../Badge/Me'
import { Icon } from '../Icon/Icon'
import { focusRing, touchTarget } from '../styles'

// Figma Row/Member(30:69575) · Name(TEXT) · Leader · Me · Kick(BOOLEAN). 그룹원 패널(Panel/Side)의 한 줄(300 × 56).
// 프사 M + 이름 + 왕관(그룹장) + "나" 배지 + 오른쪽 "강퇴"(그룹장 화면에서 남의 행만).
export type RowMemberProps = Omit<HTMLAttributes<HTMLDivElement>, 'children'> & {
  /** Figma avatar(Avatar M) + Name */
  person: AvatarPerson
  /** 이름 표기를 바꿀 때. 기본 person.name */
  name?: ReactNode
  /** Figma Leader: 이름 옆 왕관(warning/500) */
  leader?: boolean
  /** Figma Me: "나" 배지 + 프사 보라 테두리. 기본 person.me */
  me?: boolean
  /** Figma Kick: 오른쪽 "강퇴" 글자 버튼. 객체를 넘기면 켜진다(그룹장 화면의 남의 행에만) */
  kick?: { onClick?: () => void; label?: ReactNode }
  children?: never
}

export function RowMember({ person, name, leader = false, me = person.me ?? false, kick, className, ...rest }: RowMemberProps) {
  return (
    <div className={clsx('flex w-full items-center gap-2.5 px-5 py-2.5', className)} {...rest}>
      <Avatar {...person} me={me} size="m" alt="" />
      <span className="min-w-0 truncate text-body-m-strong text-primary">{name ?? person.name}</span>
      {leader && <Icon name="crown" size={14} label="그룹장" className="shrink-0 text-warning-500" />}
      {me && <BadgeMe />}
      <span aria-hidden className="min-w-0 flex-1" />
      {kick && (
        <button
          type="button"
          aria-label={`${person.name} 강퇴`}
          onClick={kick.onClick}
          className={clsx('shrink-0 rounded-xs text-label-m text-error select-none', touchTarget, focusRing)}
        >
          {kick.label ?? '강퇴'}
        </button>
      )}
    </div>
  )
}
