import { clsx } from 'clsx'
import type { HTMLAttributes, ReactNode } from 'react'
import { Avatar } from '../Avatar/Avatar'
import type { AvatarPerson } from '../Avatar/rules'
import { BadgeMe } from '../Badge/Me'
import { Icon } from '../Icon/Icon'
import { focusRing, touchTarget } from '../styles'

// Figma Row/Member(30:69575) · Name(TEXT) · Leader · Me · Kick(BOOLEAN). 그룹원 패널(Panel/Side)의 한 줄(300 × 56).
// 프사 M + 왕관(그룹장) + 이름 + "나" 배지 + 오른쪽 "강퇴"(그룹장 화면에서 남의 행만).
// DS17(화면명세 v0.5.8 0-8 · B-20, HF-15): 왕관은 이름 앞, 채운 왕관 14 · icon/subtle, 간격 4. "강퇴"는 Body/S Regular + text/error.

export type LeaderCrownProps = {
  className?: string
}

/**
 * 그룹장 표시(채운 왕관 14, icon/subtle, "그룹장"으로 읽힘). 그룹원 패널·여정 정보 그룹원 줄 등 모든 곳에서 이름 **앞**에 둔다.
 * 노란색(warning)·외곽선 왕관은 쓰지 않는다.
 */
export function LeaderCrown({ className }: LeaderCrownProps) {
  return <Icon name="crown" size={14} label="그룹장" fill="currentColor" className={clsx('shrink-0 text-icon-subtle', className)} />
}
export type RowMemberProps = Omit<HTMLAttributes<HTMLDivElement>, 'children'> & {
  /** Figma avatar(Avatar M) + Name */
  person: AvatarPerson
  /** 이름 표기를 바꿀 때. 기본 person.name */
  name?: ReactNode
  /** Figma Leader: 이름 앞 채운 왕관(icon/subtle) */
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
      <span className="flex min-w-0 items-center gap-1">
        {leader && <LeaderCrown />}
        <span className="min-w-0 truncate text-body-m-strong text-primary">{name ?? person.name}</span>
      </span>
      {me && <BadgeMe />}
      <span aria-hidden className="min-w-0 flex-1" />
      {kick && (
        <button
          type="button"
          aria-label={`${person.name} 강퇴`}
          onClick={kick.onClick}
          className={clsx('shrink-0 rounded-xs text-body-s text-error select-none', touchTarget, focusRing)}
        >
          {kick.label ?? '강퇴'}
        </button>
      )}
    </div>
  )
}
