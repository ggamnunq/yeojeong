import { clsx } from 'clsx'
import type { HTMLAttributes, ReactNode } from 'react'
import { Avatar } from '../Avatar/Avatar'
import type { AvatarPerson } from '../Avatar/rules'
import { BadgeMe } from '../Badge/Me'
import { formatKrw } from '../format'
import { Tag } from '../Tag/Tag'

// Figma Row/MemberAmount(24:61297) · Name · Amount(TEXT) · Me(BOOLEAN). 사람 + 금액 한 줄(52).
// 현황 인당 부담·멤버별 금액. 전폭 행이 아니라 거터 블록(좌우 20) 안에 넣는다(Figma 폭 350).
// 나간 멤버(person.left)는 Figma 속성에 없지만 spec C-08에 따라 프사 Left + 「나간 멤버」 태그를 붙인다(SettlementRow와 같은 규칙).
export type RowMemberAmountProps = Omit<HTMLAttributes<HTMLDivElement>, 'children'> & {
  /** Figma avatar(Avatar S) + Name */
  person: AvatarPerson
  /** Figma Amount. 숫자면 formatKrw(₩94,770), 다른 통화·문구는 그대로 */
  amount: number | ReactNode
  /** Figma Me: 이름 옆 "나" 배지 + 프사 보라 테두리. 기본 person.me */
  me?: boolean
  /** 이름 표기를 바꿀 때. 기본 person.name */
  name?: ReactNode
  children?: never
}

export function RowMemberAmount({ person, amount, me = person.me ?? false, name, className, ...rest }: RowMemberAmountProps) {
  const left = person.left ?? false
  return (
    <div className={clsx('flex w-full items-center gap-3 py-3', className)} {...rest}>
      <Avatar {...person} me={me} size="s" alt="" />
      <span className="flex min-w-0 flex-1 items-center gap-1.5">
        <span className="truncate text-body-m text-primary">{name ?? person.name}</span>
        {me && <BadgeMe />}
        {left && <Tag type="left" size="s" />}
      </span>
      <span className="shrink-0 font-amount text-amount-s whitespace-nowrap text-primary">
        {typeof amount === 'number' ? formatKrw(amount) : amount}
      </span>
    </div>
  )
}
