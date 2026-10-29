import { clsx } from 'clsx'
import { useQuery } from '@tanstack/react-query'
import { useId, type ReactNode } from 'react'
import { Link } from 'react-router'
import { Avatar, CardHeroTone, Icon, LeaderCrown, orderMembers, RowTone, type RouteProgressPhase } from '../../ds'
import { focusRing, touchTarget } from '../../ds/styles'
import type { MemberSummary, TripStatus } from '../../api'
import { paths } from '../../app/paths'
import { InviteQrButton } from '../trips/components/InviteQrButton'
import { formatInviteCode } from '../trips/rules'
import { tripFxQuery } from '../wallet/api'
import { formatFxLabel } from '../wallet/format'

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
  meta: ReactNode
  /** 그룹장 「수정」(여정 정보 수정, W9: 연필 아이콘 → 텍스트 버튼 Ghost S — 발견성) */
  onEdit?: () => void
}

/** 영웅 카드 · 톤(DS Card/HeroTone): 라벨 · 「수정」 → 영웅 숫자 [+ 보조] → 경로 → 메타 한 줄 */
export function TripHeroCard({ status, label, value, suffix, start, end, days, current, meta, onEdit }: TripHeroCardProps) {
  return (
    <CardHeroTone
      label={label}
      hero={value}
      heroSuffix={suffix}
      action={onEdit && { label: '여정 정보 수정', text: '수정', onClick: onEdit }}
      route={{ phase: PHASE[status], start, end, days, current }}
      meta={meta}
    />
  )
}

/**
 * 영웅 카드 메타 한 줄 "오사카 · 3박 4일 · 예산 ₩1,200,000"(화면명세 0-5 v0.5.8).
 * 장소는 사용자가 적은 글자 그대로라 길 수 있다 — 장소 부분만 한 줄 말줄임, 뒤의 기간·예산은 남긴다.
 */
export function TripMeta({ place, rest }: { place: string; rest: string }) {
  return (
    <span className="flex min-w-0 whitespace-nowrap">
      <span className="min-w-0 truncate">{place}</span>
      <span className="shrink-0">&nbsp;·&nbsp;{rest}</span>
    </span>
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
            <span className="flex max-w-full items-center gap-1">
              {m.role === 'LEADER' && <LeaderCrown />}
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
              {/* HF-23: 진한 사람 + 오른쪽 아래 채운 ⊕ 배지 */}
              <span className="relative grid size-12 place-items-center rounded-full bg-subtle transition-colors group-active:bg-pressed">
                <span className="relative">
                  <Icon name="user" size={24} className="text-icon-default" />
                  <span
                    aria-hidden
                    className="absolute -right-1 -bottom-0.5 grid size-3.5 place-items-center rounded-full bg-icon-default ring-2 ring-bg-subtle"
                  >
                    <Icon name="plus" size={12} className="text-icon-inverse" />
                  </span>
                </span>
              </span>
              <span className="text-body-s-strong text-secondary">추가</span>
            </button>
          </li>
        )}
      </ul>
    </section>
  )
}

/** 초대코드 톤 행(DS Row/Tone): "초대코드" + K7M-2QX · [QR 36](W8 → HF-61 시트) · 「복사」 */
export function InviteCodeRow({ code, onCopy, onQr }: { code: string; onCopy: () => void; onQr?: () => void }) {
  return (
    <RowTone
      label="초대코드"
      value={formatInviteCode(code)}
      accessory={onQr ? <InviteQrButton size="s" onClick={onQr} /> : undefined}
      action={{ label: '복사', icon: 'copy', 'aria-label': '초대코드 복사', onClick: onCopy }}
    />
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

/**
 * 환율 톤 행(HF-23, v0.6.0): "환율" + "100엔 = 919.20원" ›  → 환율 화면(HF-29). 외화 여정만.
 * 지갑에 있던 환율 진입점을 여기로 옮겼다(화면명세 WF-23 5b). 고시가 아직 없으면 값 자리에 "—"
 */
export function FxRow({ tripId }: { tripId: string }) {
  const fx = useQuery({ ...tripFxQuery(tripId), meta: { silent: true } })
  const current = fx.data?.current
  const value = current
    ? formatFxLabel(current.displayUnit, current.currencyNameKo, current.displayRate)
    : fx.data
      ? `${fx.data.displayUnit}${fx.data.currencyNameKo} = —`
      : '—'
  return (
    <Link
      to={paths.fx(tripId)}
      className={clsx(
        'flex w-full items-center justify-between gap-3 rounded-lg bg-subtle py-4 pr-4 pl-5 transition-[filter] select-none active:brightness-95',
        focusRing,
      )}
    >
      <span className="flex min-w-0 flex-col gap-0.5">
        <span className="text-caption text-tertiary">환율</span>
        <span className="truncate font-amount text-amount-m text-amount-default">{value}</span>
      </span>
      <Icon name="chevron-right" size={20} className="shrink-0 text-icon-subtle" />
    </Link>
  )
}
