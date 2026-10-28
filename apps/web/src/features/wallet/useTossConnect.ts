import { useMutation } from '@tanstack/react-query'
import { useState } from 'react'
import { useLocation, useNavigate } from 'react-router'
import { handleApiError } from '../../api'
import { browser, type PendingWindow } from '../auth/browser'
import type { FinConsentSheetProps } from '../auth/components/FinConsentSheet'
import { finConsentIds, startConnection } from './api'
import { connectPath, consentScreenOf, writeAttemptContext, type ConnectHandoffState } from './connect'
import type { AttemptPurpose } from './types'

export type TossConnectRequest = {
  purpose: AttemptPurpose
  /** RECONNECT일 때 */
  reconnectConnectionId?: string
  /** ✕ · 실패 때 돌아갈 화면. 기본은 지금 주소 */
  from?: string
  /** 연결이 끝나면 갈 곳(같은 origin 경로). 없으면 가입은 진입 라우팅, 나머지는 /wallet */
  returnTo?: string
}

/**
 * 토스 연결 시작(FR-801·805·809). 누른 순간 빈 새 창 → POST /payment-connections → 그 창을 인증 주소로 → WF-06.
 * 403 CONSENT_REQUIRED(FIN_*)면 W3A의 금융정보 연동 동의 시트(HF-05b)를 연다. 시트가 동의 저장 → 연결 시도 → WF-06까지 잇는다.
 * 쓰는 화면은 consentSheet가 있으면 <FinConsentSheet {...connect.consentSheet} />로 그린다.
 */
export function useTossConnect() {
  const navigate = useNavigate()
  const location = useLocation()
  const [consent, setConsent] = useState<TossConnectRequest | null>(null)

  const mutation = useMutation({
    mutationFn: async ({ request, pending }: { request: TossConnectRequest; pending: PendingWindow }) => {
      try {
        return await startConnection({
          provider: 'TOSS',
          purpose: request.purpose,
          ...(request.reconnectConnectionId && { reconnectConnectionId: request.reconnectConnectionId }),
        })
      } catch (error) {
        pending.cancel()
        throw error
      }
    },
    // 동의 403은 시트로, 그 밖은 아래에서 전역 처리기로 넘긴다
    meta: { silent: true },
    onSuccess: ({ attemptId, authUrl }, { request, pending }) => {
      const from = request.from ?? location.pathname
      writeAttemptContext(attemptId, {
        purpose: request.purpose,
        authUrl,
        from,
        reconnectConnectionId: request.reconnectConnectionId,
        opened: true,
      })
      pending.go(authUrl)
      const handoff: ConnectHandoffState = { authUrl, purpose: request.purpose, from }
      navigate(connectPath('toss', attemptId, { returnTo: request.returnTo }), { state: handoff })
    },
    onError: (error, { request }) => {
      if (finConsentIds(error)) setConsent(request)
      else handleApiError(error)
    },
  })

  const consentSheet: FinConsentSheetProps | null = consent && {
    open: true,
    onClose: () => setConsent(null),
    screen: consentScreenOf(consent.purpose),
    purpose: consent.purpose,
    from: consent.from ?? location.pathname,
    reconnectConnectionId: consent.reconnectConnectionId,
  }

  return {
    /** 클릭 핸들러 안에서 부른다(빈 새 창을 사용자 동작 안에서 열어야 팝업이 막히지 않는다) */
    start: (request: TossConnectRequest) => mutation.mutate({ request, pending: browser.openPending() }),
    isPending: mutation.isPending,
    consentSheet,
  }
}
