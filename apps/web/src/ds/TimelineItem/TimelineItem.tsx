import { clsx } from 'clsx'
import type { ButtonHTMLAttributes, ReactNode } from 'react'
import type { AvatarPerson } from '../Avatar/rules'
import { AvatarStack } from '../AvatarStack/AvatarStack'
import { avatarStackLabel } from '../AvatarStack/rules'
import { formatKrw } from '../format'
import { focusRing } from '../styles'
import { Tag } from '../Tag/Tag'

// Figma TimelineItem(24:8408) · Type=Shared/Personal/Pending/Now × Position=First/Middle/Last(v1.6 First) × Style=Card/Plain(v1.4)
// 점 = 공동 보라 / 개인 회색 / 미확정 빈 회색 링 / 지금 보라(v1.4, 노을은 도착점·보낼 돈 전용).
// 날짜의 첫 노드 = position="first"(점 위로 레일이 나가지 않음), 마지막 노드 = position="last"(점 아래 레일 없음).
// 레일은 항목 전체 높이로 이어진다(v1.4 레일 끊김 수정). 카드는 누르면 결제 상세가 열리는 버튼. 항목끼리 간격 0으로 쌓는다.
export type TimelineItemType = 'shared' | 'personal' | 'pending' | 'now'
export type TimelineItemPosition = 'first' | 'middle' | 'last'
export type TimelineItemStyle = 'card' | 'plain'

// Figma Style과 이름이 겹쳐 HTML style 속성은 받지 않는다(htmlType과 같은 규칙)
export type TimelineItemProps = Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'type' | 'style' | 'children'> & {
  type?: TimelineItemType
  /** Figma Position. 기본 middle. first = 날짜의 첫 노드(위 레일 숨김), last = 마지막 노드(아래 레일 없음) */
  position?: TimelineItemPosition
  /** Figma Style: card = 흰 카드 + 테두리, plain = 면·테두리 없음(하이파이 기본, 레일 1.5 · 점 10) */
  style?: TimelineItemStyle
  /** Figma time: "12:40" */
  time: ReactNode
  /** Figma merchant. Now는 기본 "지금" */
  merchant?: ReactNode
  /** Figma meta: "¥3,200 · 민지" / "¥4,650 · 내 결제" · Now는 위치 등 */
  meta?: ReactNode
  /** 원화 금액(Now에는 없음) */
  amount?: number
  /** Figma participants: 부담 인원(Shared만) */
  participants?: readonly AvatarPerson[]
  htmlType?: 'button' | 'submit' | 'reset'
  children?: never
}

const DOT = {
  shared: 'bg-expense-shared-solid',
  personal: 'bg-expense-personal-solid',
  pending: 'border-2 border-neutral-400 bg-surface',
  now: 'bg-brand ring-4 ring-primary-100',
} satisfies Record<TimelineItemType, string>

export function TimelineItem({
  type = 'shared',
  position = 'middle',
  style = 'card',
  time,
  merchant,
  meta,
  amount,
  participants,
  htmlType = 'button',
  className,
  ...rest
}: TimelineItemProps) {
  const now = type === 'now'
  const plain = style === 'plain'
  const line = plain ? 'w-[1.5px]' : 'w-0.5'

  return (
    <div className={clsx('flex gap-2 px-5', className)}>
      <span
        className={clsx(
          'w-10 shrink-0 pt-3.5 text-right font-amount text-caption leading-4.5 font-medium',
          now ? 'text-brand' : 'text-tertiary',
        )}
      >
        {time}
      </span>
      <span aria-hidden className="flex w-5 shrink-0 flex-col items-center">
        {/* 첫 노드는 위 레일 자리만 남기고(점 위치 유지) 그리지 않는다 */}
        <span
          className={clsx('h-3.5 shrink-0', line, now ? 'bg-brand' : 'bg-border-strong', position === 'first' && 'invisible')}
        />
        <span className={clsx('shrink-0 rounded-full', plain && !now ? 'size-2.5' : 'size-3.5', DOT[type])} />
        {position !== 'last' && <span className={clsx('flex-1', line, 'bg-border-strong')} />}
      </span>
      {now ? (
        <span className="flex min-w-0 flex-1 items-center gap-2 pt-2.5 pb-4">
          <span className="shrink-0 text-label-m text-brand">{merchant ?? '지금'}</span>
          {meta != null && <span className="min-w-0 truncate text-caption text-tertiary">{meta}</span>}
        </span>
      ) : (
        <div className="min-w-0 flex-1 pb-3">
          <button
            type={htmlType}
            className={clsx(
              'flex w-full flex-col gap-1.5 rounded-lg text-left transition-colors select-none enabled:active:bg-pressed',
              plain ? 'py-2.5 pl-1' : 'border border-default bg-surface px-3.5 py-3',
              focusRing,
            )}
            {...rest}
          >
            <span className="flex w-full items-center gap-2">
              <span className="min-w-0 flex-1 truncate text-body-m-strong text-primary">{merchant}</span>
              {amount !== undefined && (
                <span
                  className={clsx(
                    'shrink-0 font-amount text-amount-s whitespace-nowrap',
                    type === 'pending' ? 'text-secondary' : 'text-amount-default',
                  )}
                >
                  {formatKrw(amount)}
                </span>
              )}
            </span>
            <span className="flex min-w-0 items-center gap-1.5">
              {type === 'shared' && participants && participants.length > 0 && (
                <AvatarStack people={participants} size="xs" label={`부담 인원 ${avatarStackLabel(participants)}`} />
              )}
              {type === 'personal' && <Tag type="personal" size="s" />}
              {meta != null && <span className="min-w-0 truncate text-caption text-tertiary">{meta}</span>}
              {type === 'pending' && <Tag type="pending" size="s" />}
            </span>
          </button>
        </div>
      )}
    </div>
  )
}
