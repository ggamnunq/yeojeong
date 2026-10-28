import { useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'
import { useNavigate } from 'react-router'
import { keys } from '../../../api'
import { paths } from '../../../app/paths'
import { readLastTripId, rememberTripId, tripQuery, useTripDetail } from '../../../app/trip'
import { Button, Dialog } from '../../../ds'
import { endPreviewQuery, useDeleteGroup, useEndTrip, useStartTrip } from '../../trips/api'
import { copyInviteCode, shareInvite } from '../../trips/invite'
import {
  formatRouteDate,
  isStartPeriodOver,
  todayKst,
  tripDayIndex,
  tripHero,
  tripMetaLine,
  tripPermissions,
} from '../../trips/rules'
import type { NavState, TripInfo } from '../../trips/types'
import { InviteCodeRow, MemberAvatars, TextLink, TripHeroCard } from '../components'

type OpenDialog = 'start' | 'end' | 'delete' | null

/**
 * 여정 정보 탭(셸 안 본문). 단계로 화면이 바뀐다.
 * - 시작 전(HF-16): 출발까지 D-n · 경로 · 그룹원 · 초대코드 · (그룹장) 「여정 시작」 → HF-17 · 「그룹 삭제」(Danger)
 *   종료일이 지난 시작 전 여정(Q-26): 그룹장은 「기간 수정」, 멤버는 비활성 「여정 시작」
 * - 진행 중(HF-23): 여행 중 Day n / m · 그룹원 + 「추가」 · 초대코드 · (그룹장) 「여정 종료하기」 → HF-24
 * - 종료 후: 도착한 경로, 읽기 전용(초대코드·추가·버튼·연필 없음)
 * 버튼 노출은 서버 permissions(없으면 role·status로 같은 규칙)로 정한다.
 */
export default function TripInfoPage() {
  const trip: TripInfo = useTripDetail()
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const today = todayKst()
  const permissions = tripPermissions(trip, today)
  const hero = tripHero(trip, today)
  const leader = trip.me.role === 'LEADER'
  const periodOver = isStartPeriodOver(trip, today)
  const tripId = trip.tripId

  const [dialog, setDialog] = useState<OpenDialog>(null)
  const [pendingCount, setPendingCount] = useState(0)
  const [loadingPreview, setLoadingPreview] = useState(false)
  const start = useStartTrip(tripId)
  const end = useEndTrip(tripId)
  const deleteGroup = useDeleteGroup()

  const goToEdit = () => navigate(paths.tripEdit(tripId), { state: { from: 'info' } satisfies NavState })
  const refreshTrip = () => queryClient.fetchQuery({ ...tripQuery(tripId), staleTime: 0 }).catch(() => undefined)
  const close = () => setDialog(null)

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
          meta={tripMetaLine(trip)}
          onEdit={permissions.canEdit ? goToEdit : undefined}
        />
      </div>

      <div className="px-gutter pt-8">
        <MemberAvatars members={trip.members} onAdd={trip.status === 'ONGOING' ? share : undefined} />
      </div>

      {code && (
        <div className="px-gutter pt-8">
          <InviteCodeRow code={code} onCopy={() => void copyInviteCode(code)} />
        </div>
      )}

      <div className="min-h-8 flex-1" />

      {trip.status === 'UPCOMING' && (leader || periodOver) && (
        <div className="flex flex-col items-center gap-1 px-gutter pb-3">
          {leader && periodOver ? (
            <Button type="primary" size="l" label="기간 수정" className="w-full" onClick={goToEdit} />
          ) : (
            <Button
              type="primary"
              size="l"
              label="여정 시작"
              className="w-full"
              disabled={!permissions.canStart}
              onClick={() => setDialog('start')}
            />
          )}
          {permissions.canDeleteGroup && <TextLink onClick={() => setDialog('delete')}>그룹 삭제</TextLink>}
        </div>
      )}
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
        onCancel={close}
        onConfirm={confirmStart}
      />
      <Dialog
        open={dialog === 'end'}
        title="여정을 종료할까요?"
        message={pendingCount > 0 ? `미확정 ${pendingCount}건은 개인으로 처리돼요` : null}
        confirmLabel="종료하기"
        onCancel={close}
        onConfirm={confirmEnd}
      />
      <Dialog
        open={dialog === 'delete'}
        type="danger"
        title="그룹을 삭제할까요?"
        message="모든 멤버에게서 사라져요"
        confirmLabel="삭제"
        onCancel={close}
        onConfirm={confirmDelete}
      />
    </div>
  )
}
