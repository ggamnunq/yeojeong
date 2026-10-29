import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useCallback, useEffect, useSyncExternalStore } from 'react'
import { useLocation, useNavigate } from 'react-router'
import { handleApiError, isApiError, keys } from '../../../api'
import { paths } from '../../../app/paths'
import { useSession } from '../../../app/session'
import { toast } from '../../../notifications'
import { invitePreviewQuery, useJoinTrip } from '../api'
import { inviteErrorText } from '../invite'
import { activeInvite, isInviteLandingPath } from '../pendingInvite'
import { COPY } from '../rules'
import { InviteResponseSheet } from './InviteResponseSheet'

/** 초대 오류 → 토스트(HF-62c). HF-12 문구를 그대로 쓰고, 따로 정한 문구가 없으면 전역 처리기 */
function toastInviteError(error: unknown) {
  const text = inviteErrorText(error)
  if (text) toast.error(text)
  else handleApiError(error)
}

/**
 * QR·공유 링크로 받은 초대(W8). 라우터 루트에 하나. 로그인(가입·재동의까지 끝난) 상태로 첫 화면에 오면
 * 보관한 코드를 꺼내(바로 지운다) 미리보기 → HF-62 시트. 예외는 시트 없이 첫 화면 + 토스트(HF-62c, HF-12 문구):
 * 잘못된·만료 코드 "초대코드를 다시 확인해 주세요", 종료·강퇴·인원 초과 "참여할 수 없는 여정이에요",
 * 이미 멤버면 그 여정으로 + "이미 참여한 여정이에요"
 */
export function InviteResponseHost() {
  const { pathname } = useLocation()
  if (!isInviteLandingPath(pathname)) return null
  return <InviteResponseFlow />
}

function InviteResponseFlow() {
  const session = useSession()
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const ready = !session.isPending && session.isAuthenticated && !session.signupRequired && !session.reconsentRequired
  const code = useSyncExternalStore(activeInvite.subscribe, activeInvite.get)
  const preview = useQuery({ ...invitePreviewQuery(code ?? ''), enabled: code !== null })
  const join = useJoinTrip()

  // 보관함(sessionStorage)에서 응답 중으로 옮긴다. 형식이 틀린 코드는 API를 부르지 않고 안내만
  useEffect(() => {
    if (ready && activeInvite.activate() === 'invalid') toast.error(COPY.inviteInvalid)
  }, [ready])

  const finish = useCallback(() => {
    const current = activeInvite.get()
    if (current) queryClient.removeQueries({ queryKey: keys.invite(current), exact: true })
    activeInvite.clear()
  }, [queryClient])

  const goToTrip = useCallback(
    (tripId: string) => {
      finish()
      void navigate(paths.trip(tripId))
    },
    [finish, navigate],
  )

  const data = code !== null ? preview.data : undefined
  const error = code !== null ? preview.error : null

  useEffect(() => {
    if (data?.alreadyMember && data.tripId) {
      toast.info(COPY.alreadyMember)
      goToTrip(data.tripId)
    }
  }, [data, goToTrip])

  useEffect(() => {
    if (!error) return
    toastInviteError(error)
    finish()
  }, [error, finish])

  const onJoin = () => {
    if (!code || join.isPending) return
    join.mutate(code, {
      // 단계별 기본 탭으로(진행 중 → 결제내역, 시작 전 → 여정 정보)
      onSuccess: ({ tripId }) => goToTrip(tripId),
      onError: (joinError) => {
        if (isApiError(joinError) && joinError.code === 'ALREADY_MEMBER') {
          toast.info(COPY.alreadyMember)
          return finish()
        }
        const text = inviteErrorText(joinError)
        if (text) {
          toast.error(text)
          return finish()
        }
        // 429·연결 실패 등 다시 해 볼 수 있는 오류: 시트를 그대로 두고 전역 토스트(명세 v0.7.4 제안 채택)
        handleApiError(joinError)
      },
    })
  }

  const open = data && !data.alreadyMember ? data : null
  return <InviteResponseSheet preview={open} joining={join.isPending} onJoin={onJoin} onCancel={finish} />
}
