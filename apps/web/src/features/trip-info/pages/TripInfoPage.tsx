import { useQueryClient } from '@tanstack/react-query'
import { clsx } from 'clsx'
import { useState } from 'react'
import { useNavigate } from 'react-router'
import { keys } from '../../../api'
import { paths } from '../../../app/paths'
import { useShellCta } from '../../../app/shellCta'
import { readLastTripId, rememberTripId, tripQuery, useTripDetail } from '../../../app/trip'
import { Dialog } from '../../../ds'
import { endPreviewQuery, useDeleteGroup, useEndTrip, useStartTrip } from '../../trips/api'
import { InviteQrSheet } from '../../trips/components/InviteQrSheet'
import { copyInviteCode, shareInvite } from '../../trips/invite'
import {
  formatRouteDate,
  startAction,
  todayKst,
  tripDayIndex,
  tripHero,
  tripMetaRest,
  tripPermissions,
} from '../../trips/rules'
import type { NavState, TripInfo } from '../../trips/types'
import { FxRow, InviteCodeRow, MemberAvatars, TextLink, TripHeroCard, TripMeta } from '../components'
import { NoticeBanner } from '../../notices/NoticeBanner'

type OpenDialog = 'start' | 'end' | 'delete' | null

/**
 * 여정 정보 탭(셸 안 본문). 단계로 화면이 바뀐다.
 * - 시작 전(HF-16): 출발까지 D-n · 경로 · 그룹원 · 초대코드([QR] → HF-61 시트 · 복사) · (그룹장) 「여정 시작」 → HF-17 · 「그룹 삭제」(Danger)
 *   종료일이 지난 시작 전 여정(Q-26, 서버 startBlockReason = PERIOD_OVER): 그룹장은 「기간 수정」, 멤버는 시작 버튼 없음
 * - 진행 중(HF-23): 여행 중 Day n / m · 그룹원 + 「추가」 · 초대코드 · (그룹장) 「여정 종료하기」 → HF-24
 * - 종료 후: 도착한 경로, 읽기 전용(초대코드·추가·버튼·「수정」 없음)
 * 그룹장은 영웅 카드 오른쪽 위 「수정」(Ghost S, W9)으로 여정 정보 수정(WF-10 수정 모드)에 들어간다 — permissions.canEdit일 때만.
 * 버튼 노출은 서버 permissions로 정한다.
 */
export default function TripInfoPage() {
  const trip: TripInfo = useTripDetail()
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const today = todayKst()
  const permissions = tripPermissions(trip, today)
  const hero = tripHero(trip, today)
  const action = startAction(trip)
  const tripId = trip.tripId

  const [dialog, setDialog] = useState<OpenDialog>(null)
  const [qrOpen, setQrOpen] = useState(false)
  const [pendingCount, setPendingCount] = useState(0)
  const [loadingPreview, setLoadingPreview] = useState(false)
  const start = useStartTrip(tripId)
  const end = useEndTrip(tripId)
  const deleteGroup = useDeleteGroup()

  const goToEdit = () => navigate(paths.tripEdit(tripId), { state: { from: 'info' } satisfies NavState })
  // 그룹장 · 시작 전: 하단 가로 2버튼(왼쪽 「그룹 삭제」 Danger-weak · 오른쪽 「여정 시작」, 기간이 지났으면 「기간 수정」). 멤버는 없음
  const deleteSecondary = permissions.canDeleteGroup
    ? { label: '그룹 삭제', type: 'danger-weak' as const, onClick: () => setDialog('delete') }
    : undefined
  useShellCta(
    action === 'edit-period'
      ? { label: '기간 수정', onClick: goToEdit, secondary: deleteSecondary }
      : action === 'start'
        ? { label: '여정 시작', disabled: !permissions.canStart, onClick: () => setDialog('start'), secondary: deleteSecondary }
        : null,
  )
  const refreshTrip = () => queryClient.fetchQuery({ ...tripQuery(tripId), staleTime: 0 }).catch(() => undefined)
  const close = () => setDialog(null)
  // 서버 응답을 기다리는 동안(확인 버튼 Loading)은 취소·ESC로 닫지 않는다
  const cancelUnless = (pending: boolean) => () => {
    if (!pending) close()
  }

  const confirmStart = () => {
    if (start.isPending) return
    start.mutate(trip.version, {
      onSuccess: () => {
        close()
        void navigate(paths.payments(tripId), { replace: true })
      },
      // 이미 시작(409)·그룹장 아님(403): 닫고 최신 상태로 다시 그린다(안내는 전역 토스트)
      onError: () => {
        close()
        void refreshTrip()
      },
    })
  }

  // 종료 다이얼로그는 그룹 전체 미확정 건수를 받은 뒤 연다
  const openEnd = async () => {
    if (loadingPreview) return
    setLoadingPreview(true)
    try {
      const preview = await queryClient.fetchQuery(endPreviewQuery(tripId))
      setPendingCount(preview.pendingCount)
      setDialog('end')
    } catch {
      void refreshTrip()
    } finally {
      setLoadingPreview(false)
    }
  }

  const confirmEnd = () => {
    if (end.isPending) return
    end.mutate(trip.version, {
      onSuccess: () => {
        close()
        void navigate(paths.settlement(tripId), { replace: true })
      },
      // 409: 최신 상태로. 이미 끝났으면 정산 탭으로
      onError: async () => {
        close()
        const latest = await refreshTrip()
        if (latest?.status === 'ENDED') void navigate(paths.settlement(tripId), { replace: true })
      },
    })
  }

  const confirmDelete = () => {
    if (deleteGroup.isPending) return
    deleteGroup.mutate(trip.groupId, {
      onSuccess: async () => {
        close()
        if (readLastTripId() === tripId) rememberTripId(null)
        // 진입 라우팅이 지운 여정을 고르지 않게 목록을 먼저 비우고, 떠난 뒤 이 여정 캐시를 지운다
        queryClient.removeQueries({ queryKey: keys.trips.list, exact: true })
        await navigate(paths.splash(), { replace: true })
        queryClient.removeQueries({ queryKey: keys.trips.detail(tripId) })
      },
      onError: () => {
        close()
        void refreshTrip()
      },
    })
  }

  const code = permissions.canInvite ? trip.inviteCode : null
  const share = code ? () => void shareInvite({ groupName: trip.groupName, code }) : undefined

  return (
    <div className="flex flex-1 flex-col">
      <h2 className="sr-only">여정 정보</h2>
      {/* 공지 배너: 시작 전에는 이 화면이 여정 첫 화면(WF-16)이라 여기에도 둔다. 진행 중·종료 뒤에는 결제내역이 첫 화면 */}
      {trip.status === 'UPCOMING' && <NoticeBanner className="px-gutter pb-2" />}
      <div className="px-gutter">
        <TripHeroCard
          status={trip.status}
          label={hero.label}
          value={hero.value}
          suffix={hero.suffix}
          start={formatRouteDate(trip.startDate)}
          end={formatRouteDate(trip.endDate)}
          days={trip.days}
          current={trip.status === 'ONGOING' ? tripDayIndex(trip, today) : undefined}
          meta={<TripMeta place={trip.placeLabel} rest={tripMetaRest(trip)} />}
          onEdit={permissions.canEdit ? goToEdit : undefined}
        />
      </div>

      <div className="px-gutter pt-8">
        <MemberAvatars members={trip.members} onAdd={trip.status === 'ONGOING' ? share : undefined} />
      </div>

      {code && (
        <div className="px-gutter pt-8">
          <InviteCodeRow code={code} onCopy={() => void copyInviteCode(code)} onQr={() => setQrOpen(true)} />
        </div>
      )}
      {code && <InviteQrSheet open={qrOpen} onClose={() => setQrOpen(false)} groupName={trip.groupName} code={code} />}

      {/* 외화 여정만 환율 행(HF-23) → 환율(HF-29). KRW 여정은 trip.fx = null */}
      {trip.fx && (
        <div className={clsx('px-gutter', code ? 'pt-3' : 'pt-8')}>
          <FxRow tripId={tripId} />
        </div>
      )}

      <div className="min-h-8 flex-1" />

      {trip.status === 'ONGOING' && permissions.canEnd && (
        <div className="flex flex-col items-center px-gutter pb-3">
          <TextLink onClick={() => void openEnd()} disabled={loadingPreview}>
            여정 종료하기
          </TextLink>
        </div>
      )}

      <Dialog
        open={dialog === 'start'}
        title="여정을 시작할까요?"
        message="시작 후에는 그룹을 삭제할 수 없어요"
        confirmLabel="시작하기"
        confirmState={start.isPending ? 'loading' : 'default'}
        onCancel={cancelUnless(start.isPending)}
        onConfirm={confirmStart}
      />
      <Dialog
        open={dialog === 'end'}
        title="여정을 종료할까요?"
        message={pendingCount > 0 ? `미확정 ${pendingCount}건은 개인으로 처리돼요` : null}
        confirmLabel="종료하기"
        confirmState={end.isPending ? 'loading' : 'default'}
        onCancel={cancelUnless(end.isPending)}
        onConfirm={confirmEnd}
      />
      <Dialog
        open={dialog === 'delete'}
        type="danger"
        title="그룹을 삭제할까요?"
        message="모든 멤버에게서 사라져요"
        confirmLabel="삭제"
        confirmState={deleteGroup.isPending ? 'loading' : 'default'}
        onCancel={cancelUnless(deleteGroup.isPending)}
        onConfirm={confirmDelete}
      />
    </div>
  )
}
