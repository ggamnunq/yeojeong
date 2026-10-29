import { clsx } from 'clsx'
import { Avatar, AvatarStack, LeaderCrown, RouteProgress } from '../../../ds'
import { daysBetween, formatRouteDate, todayKst } from '../rules'
import type { InvitePreview } from '../types'

export type InvitePreviewCardProps = {
  preview: InvitePreview
  className?: string
}

/**
 * HF-62 초대 응답 시트의 미리보기 카드(Figma SheetContent/InviteJoin 140:16483 「preview card」). 여정명은 시트 제목이 말한다.
 * 톤 카드(bg/subtle · radius 16 · 패딩 24/20/20): 장소(Body/S 2차) → 20 → 경로(출발 → 도착 날짜) → 20 →
 * 한 줄 양끝: 왼쪽 그룹장(프사 S 28 · 8 · 왕관 + 이름), 오른쪽 그룹원 프사 스택(가입 순, "나" 표시 없음) · 8 · "{n}명"
 */
export function InvitePreviewCard({ preview, className }: InvitePreviewCardProps) {
  const days = daysBetween(preview.startDate, preview.endDate) + 1
  const ongoing = preview.status === 'ONGOING'
  const today = daysBetween(preview.startDate, todayKst()) + 1
  return (
    <section aria-label="여정 미리보기" className={clsx('flex flex-col rounded-xl bg-subtle px-5 pt-6 pb-5', className)}>
      {/* 장소는 사용자가 적은 글자 그대로 — 길면 한 줄 말줄임(0-5) */}
      <p className="truncate text-body-s text-secondary">{preview.placeLabel}</p>
      <RouteProgress
        className="mt-5"
        phase={ongoing ? 'ongoing' : 'upcoming'}
        start={formatRouteDate(preview.startDate)}
        end={formatRouteDate(preview.endDate)}
        days={days}
        current={ongoing ? today : undefined}
      />
      <div className="mt-5 flex min-h-7 items-center justify-between gap-3">
        {preview.leader ? (
          <p className="flex min-w-0 items-center gap-2">
            <Avatar size="s" name={preview.leader.nickname} src={preview.leader.profileImageUrl} alt="" />
            <span className="flex min-w-0 items-center gap-0.5 text-body-s text-primary">
              <LeaderCrown />
              <span className="truncate">{preview.leader.nickname}</span>
            </span>
          </p>
        ) : (
          <span />
        )}
        <div className="flex shrink-0 items-center gap-2">
          {preview.membersPreview.length > 0 && (
            <AvatarStack
              size="s"
              overflow={false}
              people={preview.membersPreview.map((m, i) => ({ name: m.nickname, src: m.profileImageUrl, joinOrder: i + 1 }))}
            />
          )}
          <span className="text-body-s text-secondary">{preview.memberCount}명</span>
        </div>
      </div>
    </section>
  )
}
