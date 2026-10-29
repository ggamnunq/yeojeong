import { useMutation, useQuery } from '@tanstack/react-query'
import { useNavigate } from 'react-router'
import { consentRequiredIds } from '../../../api'
import { paths } from '../../../app/paths'
import { BottomSheet, Button, SheetContentConsent } from '../../../ds'
import { consentDocumentsQuery, postConnection, postFinConsent, visibleConsents } from '../api'
import { browser, type PendingWindow } from '../browser'
import { useConsentChecks, useConsentItems } from '../consent'
import { COPY } from '../copy'
import type { ConnectHandoffState, ConnectionPurpose, FinConsentScreen } from '../types'

// WF-05b 금융정보 연동 동의(HF-05b, FR-809). 가입 직후 WF-05는 항상, 지갑 WF-28·42는 연동 동의가 현재 버전이 아니면 띄운다.
// 동의 저장 성공 → 연결 시도 생성 → authUrl 새 창 + WF-06(/wallet/connect/toss?attempt=). 체크는 이 history 항목에 남는다.
export type FinConsentSheetProps = {
  open: boolean
  /** ✕ · 딤 · ESC · 뒤로 가기 */
  onClose: () => void
  /** 동의를 받은 화면(UserConsent.screen) */
  screen: FinConsentScreen
  purpose: ConnectionPurpose
  /** WF-06이 ✕·실패 때 돌아갈 화면 */
  from: string
  reconnectConnectionId?: string
}

export function FinConsentSheet({ open, onClose, screen, purpose, from, reconnectConnectionId }: FinConsentSheetProps) {
  const navigate = useNavigate()
  const documents = useQuery({ ...consentDocumentsQuery('FIN_LINK'), enabled: open })
  const docs = visibleConsents(documents.data)
  const consent = useConsentChecks(docs)
  const items = useConsentItems(docs, consent.checked)

  const connect = useMutation({
    mutationFn: async (pending: PendingWindow) => {
      try {
        // 동의 저장에 성공해야 연결 시도(authUrl)를 만든다(4-10)
        await postFinConsent({ stage: 'FIN_LINK', agreements: consent.agreements(), method: consent.method, screen })
        const attempt = await postConnection({ provider: 'TOSS', purpose, reconnectConnectionId })
        return { attempt, pending }
      } catch (error) {
        pending.cancel()
        throw error
      }
    },
    // 동의 403은 아래 onError가 받는다(목록을 다시 받아 처음부터 체크)
    meta: { consentHandled: true },
    onSuccess: ({ attempt, pending }) => {
      pending.go(attempt.authUrl)
      const handoff: ConnectHandoffState = { authUrl: attempt.authUrl, purpose, from }
      // 시트 항목을 WF-06으로 바꾼다: WF-06에서 뒤로 오면 시트가 닫힌 진입 화면
      navigate(paths.walletConnectToss(attempt.attemptId), { replace: true, state: handoff })
    },
    onError: (error) => {
      // 그사이 문서 버전이 바뀜(403 CONSENT_REQUIRED) → 목록을 다시 받아 처음부터 체크
      if (consentRequiredIds(error)) {
        consent.reset()
        void documents.refetch()
      }
    },
  })

  return (
    // 시트 CTA는 끄고 SheetContent/Consent의 CTA를 쓴다(DS v1.5, 시트 리듬 20은 BottomSheet 기본)
    <BottomSheet open={open} onClose={onClose} title={COPY.finConsentTitle}>
      {documents.error ? (
        <div className="flex flex-col items-center gap-3 py-6">
          <p className="text-body-m text-secondary">{COPY.loadFailed}</p>
          <Button type="secondary" size="m" label={COPY.retry} onClick={() => void documents.refetch()} />
        </div>
      ) : (
        <SheetContentConsent
          items={items}
          onToggle={consent.toggle}
          onToggleAll={consent.toggleAll}
          loading={documents.isPending}
          cta={{
            label: COPY.agreeAndConnect,
            state: connect.isPending ? 'loading' : 'default',
            // 빈 새 창은 클릭 순간에 열어야 팝업 차단을 피한다
            onClick: () => connect.mutate(browser.openPending()),
          }}
        />
      )}
    </BottomSheet>
  )
}
