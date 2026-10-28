import { clsx } from 'clsx'
import { useId, type ReactNode } from 'react'
import { Avatar, Button, Icon, IconButton, orderMembers, RouteProgress, type RouteProgressPhase } from '../../ds'
import { focusRing, touchTarget } from '../../ds/styles'
import type { MemberSummary, TripStatus } from '../../api'
import { formatInviteCode } from '../trips/rules'

// 여정 정보 탭(HF-16·23) 블록. Figma 06 로컬 패턴(영웅 카드·톤 · 아바타 줄 · 톤 행 · 텍스트 링크)을 DS 부품과 토큰으로 조합했다.

const PHASE: Record<TripStatus, RouteProgressPhase> = { UPCOMING: 'upcoming', ONGOING: 'ongoing', ENDED: 'ended' }

export type TripHeroCardProps = {
  status: TripStatus
  label: string
  value: string
  /** 진행 중 "/ 4" */
  suffix?: string
  start: string
  end: string
  days: number
  current?: number
  meta: string
  /** 그룹장 연필(여정 정보 수정) */
  onEdit?: () => void
}

/** 영웅 카드 · 톤: 라벨 → 영웅 숫자(Amount/XL) [+ 보조] · 연필 → 20 → 경로 → 16 → 메타 한 줄 */
export function TripHeroCard({ status, label, value, suffix, start, end, days, current, meta, onEdit }: TripHeroCardProps) {
  return (
    <div className="flex flex-col rounded-xl bg-subtle py-5 pr-3 pl-5">
      <div className="flex items-start justify-between gap-2">
        <div className="flex min-w-0 flex-col gap-0.5">
          {label && <p className="text-body-s text-secondary">{label}</p>}
          <p className="flex items-baseline gap-1.5 whitespace-nowrap">
            <span className="font-amount text-amount-xl text-amount-default">{value}</span>
            {suffix && <span className="text-body-l text-tertiary">{suffix}</span>}
          </p>
        </div>
        {onEdit && <IconButton size="s" icon="edit" label="여정 정보 수정" onClick={onEdit} />}
      </div>
      <div className="mt-5 pr-2">
        <RouteProgress phase={PHASE[status]} start={start} end={end} days={days} current={current} />
      </div>
      <p className="mt-4 mb-1 text-body-s text-secondary">{meta}</p>
    </div>
  )
}

export type MemberAvatarsProps = {
  members: readonly MemberSummary[]
  /** 진행 중 프사 줄 끝 "추가"(초대 공유) */
  onAdd?: () => void
}

/** "그룹원 {n}명" + 아바타 줄(L 프사 + 왕관·이름). 나 먼저 → 가입 순(C-05). 5칸이 넘으면 가로 스크롤 */
export function MemberAvatars({ members, onAdd }: MemberAvatarsProps) {
  const titleId = useId()
  const ordered = orderMembers(members.map((m) => ({ ...m, me: m.isMe })))
  const slots = ordered.length + (onAdd ? 1 : 0)
  const scroll = slots > 5
  return (
    <section aria-labelledby={titleId} className="flex flex-col gap-4">
      <h3 id={titleId} className="text-body-s-strong text-secondary">
        그룹원 {members.length}명
      </h3>
      <ul
        className={clsx(
          'flex',
          scroll ? '-mx-gutter gap-3 overflow-x-auto px-gutter' : clsx('justify-between', onAdd ? 'px-1' : 'px-2'),
        )}
      >
        {ordered.map((m) => (
          <li key={m.membershipId} className="flex max-w-18 min-w-12 shrink-0 flex-col items-center gap-2">
            <Avatar name={m.nickname} src={m.profileImageUrl} joinOrder={m.joinOrder} me={m.isMe} size="l" alt="" />
            <span className="flex max-w-full items-center gap-0.5">
              {m.role === 'LEADER' && <Icon name="crown" size={14} label="그룹장" className="shrink-0 text-warning-500" />}
              <span className="truncate text-body-s-strong text-primary">{m.nickname}</span>
              {m.isMe && <span className="sr-only">(나)</span>}
            </span>
          </li>
        ))}
        {onAdd && (
          <li className="flex min-w-12 shrink-0">
            <button
              type="button"
              onClick={onAdd}
              className={clsx('group flex w-full flex-col items-center gap-2 rounded-md select-none', focusRing)}
            >
              <span className="grid size-12 place-items-center rounded-full bg-subtle transition-colors group-active:bg-pressed">
                <Icon name="user-add" size={20} className="text-icon-default" />
              </span>
              <span className="text-body-s-strong text-secondary">추가</span>
            </button>
          </li>
        )}
      </ul>
    </section>
  )
}

/** 초대코드 톤 행: "초대코드" + K7M-2QX(Amount/M, 자간 2) · 「복사」(Secondary S) */
export function InviteCodeRow({ code, onCopy }: { code: string; onCopy: () => void }) {
  return (
    <div className="flex items-center justify-between gap-3 rounded-lg bg-subtle py-4 pr-4 pl-5">
      <p className="flex min-w-0 flex-col gap-0.5">
        <span className="text-caption text-tertiary">초대코드</span>
        <span className="font-amount text-amount-m tracking-[2px] whitespace-nowrap text-primary">{formatInviteCode(code)}</span>
      </p>
      <Button type="secondary" size="s" leadingIcon icon="copy" label="복사" aria-label="초대코드 복사" onClick={onCopy} />
    </div>
  )
}

/** 텍스트 링크(Body/S 3차, 밑줄 없음, 위아래 10/6): "그룹 삭제" · "여정 종료하기" */
export function TextLink({ children, onClick, disabled }: { children: ReactNode; onClick: () => void; disabled?: boolean }) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={clsx(
        'rounded-sm px-2 pt-2.5 pb-1.5 text-body-s text-tertiary select-none enabled:active:text-secondary disabled:text-disabled',
        touchTarget,
        focusRing,
      )}
    >
      {children}
    </button>
  )
}
