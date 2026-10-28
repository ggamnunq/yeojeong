import { useQuery } from '@tanstack/react-query'
import { useEffect, useState } from 'react'
import { Navigate, useLocation, useNavigate, useSearchParams } from 'react-router'
import { isApiError } from '../../../api'
import { paths, safeReturnTo } from '../../../app/paths'
import { Button, IllustLinking } from '../../../ds'
import { toast } from '../../../notifications'
import { FinConsentSheet } from '../../auth/components/FinConsentSheet'
import { ATTEMPT_POLL_MS, attemptQuery } from '../api'
import { CloseOnboardingShell, ConnectStatus } from '../components/ConnectStatus'
import { connectPath, openTossAuth, originPath, readAttemptContext, readHandoff, writeAttemptContext } from '../connect'
import { useTossConnect } from '../useTossConnect'

/** 콜백이 실패를 알려 올 때 ?error= (S2B-1 README) */
type CallbackError = 'invalid' | 'expired' | 'cancelled' | 'provider'

/** WF-06 토스 인증 대기. 2초마다 시도 상태를 보고 인증되면 WF-07로 넘어간다(데모 어댑터는 바로 넘어간다) */
export default function TossAuthPage() {
  const [params] = useSearchParams()
  const attemptId = params.get('attempt')
  if (!attemptId) return <Navigate replace to={paths.wallet()} />
  return (
    <TossAuth
      key={attemptId}
      attemptId={attemptId}
      returnTo={safeReturnTo(params.get('returnTo'))}
      callbackError={params.get('error') as CallbackError | null}
    />
  )
}

type TossAuthProps = { attemptId: string; returnTo: string | null; callbackError: CallbackError | null }

function TossAuth({ attemptId, returnTo, callbackError }: TossAuthProps) {
  const navigate = useNavigate()
  const location = useLocation()
  // 지갑·가입 시트가 넘긴 location.state(authUrl · purpose · from)를 이 탭에 남겨 새로고침·다음 화면에서도 쓴다
  const [context] = useState(() => {
    const handoff = readHandoff(location.state)
    if (handoff) writeAttemptContext(attemptId, { ...handoff, opened: true })
    return readAttemptContext(attemptId)
  })
  const connect = useTossConnect()

  const attempt = useQuery({
    ...attemptQuery(attemptId),
    enabled: callbackError === null,
    refetchInterval: (query) =>
      query.state.error || (query.state.data && query.state.data.status !== 'WAITING') ? false : ATTEMPT_POLL_MS,
    // 인증 창에서 돌아와 탭이 다시 보이면 바로 한 번 본다
    refetchOnWindowFocus: 'always',
  })
  const purpose = attempt.data?.purpose ?? context.purpose
  const origin = originPath(purpose, context.from)
  const status = attempt.data?.status
  const failed = isApiError(attempt.error) ? attempt.error.status : null
  // 10분이 지난 시도(410 ATTEMPT_EXPIRED · EXPIRED · 콜백 ?error=expired)
  const expired = status === 'EXPIRED' || failed === 410 || callbackError === 'expired'

  // 시도만 만들고 창은 열지 않은 채 넘어온 경우 여기서 한 번 연다
  useEffect(() => {
    if (!context.authUrl || readAttemptContext(attemptId).opened) return
    writeAttemptContext(attemptId, { opened: true })
    openTossAuth(context.authUrl)
  }, [attemptId, context.authUrl])

  useEffect(() => {
    const leave = (to: string) => navigate(to, { replace: true })
    if (status === 'AUTHORIZED') leave(connectPath('select', attemptId, { returnTo }))
    else if (status === 'CONFIRMED') leave(connectPath('done', attemptId, { returnTo }))
    else if (status === 'FAILED' || callbackError === 'cancelled' || failed === 404) leave(origin)
    else if (callbackError === 'invalid' || callbackError === 'provider') {
      toast.error('잠시 후 다시 시도해 주세요')
      leave(origin)
    }
  }, [status, failed, callbackError, attemptId, returnTo, origin, navigate])

  // 만료는 안내하고 「다시 연결」로 새 시도를 만든다(확정 명세)
  useEffect(() => {
    if (expired) toast.error('연결 시간이 지났어요')
  }, [expired])

  const reconnect = () =>
    connect.start({
      purpose: purpose ?? 'WALLET_ADD',
      reconnectConnectionId: context.reconnectConnectionId,
      from: origin,
      returnTo: returnTo ?? undefined,
    })

  return (
    <CloseOnboardingShell
      onClose={() => navigate(origin, { replace: true })}
      progress={purpose === 'SIGNUP' ? 3 : undefined}
      footer={
        expired ? (
          <Button
            type="primary"
            size="l"
            label="다시 연결"
            className="w-full"
            disabled={connect.isPending || !purpose}
            onClick={reconnect}
          />
        ) : (
          <Button
            type="secondary"
            size="l"
            label="토스 다시 열기"
            className="w-full"
            disabled={!context.authUrl}
            onClick={() => context.authUrl && openTossAuth(context.authUrl)}
          />
        )
      }
    >
      <div role="status" className="flex flex-1 flex-col">
        <ConnectStatus
          illust={<IllustLinking phase={expired ? 'before' : 'pending'} width={240} />}
          title={expired ? '연결 시간이 지났어요' : '토스에서 인증 중'}
        />
      </div>
      {connect.consentSheet && <FinConsentSheet {...connect.consentSheet} />}
    </CloseOnboardingShell>
  )
}
