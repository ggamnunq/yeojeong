import { useMutation } from '@tanstack/react-query'
import { useRef, useState } from 'react'
import { useNavigate } from 'react-router'
import { handleApiError } from '../../api'
import { finConsentIds, startConnection } from './api'
import { connectPath, openTossAuth, writeAttemptContext } from './connect'
import type { FinConsentSheetProps } from './consent'
import type { AttemptPurpose, FinConsentId, FinConsentScreen } from './types'

export type TossConnectRequest = {
  purpose: AttemptPurpose
  /** RECONNECT일 때 */
  reconnectConnectionId?: string
  /** 연결이 끝나면 갈 곳(같은 origin 경로). 없으면 가입은 진입 라우팅, 나머지는 /wallet */
  returnTo?: string
}

/**
 * 토스 연결 시작(FR-801·805·809). POST /payment-connections → 인증 창 → WF-06.
 * 403 CONSENT_REQUIRED(FIN_*)면 금융정보 연동 동의 시트를 열고, 동의하면 같은 요청을 다시 보낸다.
 * 쓰는 화면은 consentSheet를 <FinConsentSheet {...connect.consentSheet} />로 그린다.
 */
export function useTossConnect({ screen }: { screen: FinConsentScreen }) {
  const navigate = useNavigate()
  const [required, setRequired] = useState<readonly FinConsentId[] | null>(null)
  const pending = useRef<TossConnectRequest | null>(null)

  const mutation = useMutation({
    mutationFn: ({ purpose, reconnectConnectionId }: TossConnectRequest) =>
      startConnection({ provider: 'TOSS', purpose, ...(reconnectConnectionId && { reconnectConnectionId }) }),
    // 동의 403은 시트로, 그 밖은 아래에서 전역 처리기로 넘긴다
    meta: { silent: true },
    onSuccess: ({ attemptId, authUrl }, request) => {
      writeAttemptContext(attemptId, { purpose: request.purpose, authUrl, opened: true })
      // 누른 직후라 대부분의 브라우저가 팝업을 허용한다. 막히면 같은 창으로 간다(콜백이 WF-07로 돌려보낸다)
      openTossAuth(authUrl)
      navigate(connectPath('toss', attemptId, { returnTo: request.returnTo }))
    },
    onError: (error, request) => {
      const ids = finConsentIds(error)
      if (ids) {
        pending.current = request
        setRequired(ids)
        return
      }
      handleApiError(error)
    },
  })

  const consentSheet: FinConsentSheetProps = {
    open: required !== null,
    required: required ?? [],
    screen,
    onClose: () => {
      pending.current = null
      setRequired(null)
    },
    onAgreed: () => {
      const request = pending.current
      pending.current = null
      setRequired(null)
      if (request) mutation.mutate(request)
    },
  }

  return {
    start: (request: TossConnectRequest) => mutation.mutate(request),
    isPending: mutation.isPending,
    consentSheet,
  }
}
