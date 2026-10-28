import { useQuery } from '@tanstack/react-query'
import { useEffect, useState } from 'react'
import { Navigate, useNavigate, useSearchParams } from 'react-router'
import { isApiError } from '../../../api'
import { paths, safeReturnTo } from '../../../app/paths'
import { Button, IllustLinking } from '../../../ds'
import { toast } from '../../../notifications'
import { ATTEMPT_POLL_MS, attemptQuery } from '../api'
import { CloseOnboardingShell, ConnectStatus } from '../components/ConnectStatus'
import {
  connectPath,
  external,
  openTossAuth,
  originPath,
  readAttemptContext,
  TOSS_WINDOW_NAME,
  writeAttemptContext,
} from '../connect'

/** WF-06 토스 인증 대기. 2초마다 시도 상태를 보고 인증되면 WF-07로 넘어간다(데모 어댑터는 바로 넘어간다) */
export default function TossAuthPage() {
  const [params] = useSearchParams()
  const attemptId = params.get('attempt')
  if (!attemptId) return <Navigate replace to={paths.wallet()} />
  return <TossAuth key={attemptId} attemptId={attemptId} returnTo={safeReturnTo(params.get('returnTo'))} />
}

function TossAuth({ attemptId, returnTo }: { attemptId: string; returnTo: string | null }) {
  const navigate = useNavigate()
  const [context] = useState(() => readAttemptContext(attemptId))
  const attempt = useQuery({
    ...attemptQuery(attemptId),
    refetchInterval: (query) => (query.state.data && query.state.data.status !== 'WAITING' ? false : ATTEMPT_POLL_MS),
    // 인증 창에서 돌아와 탭이 다시 보이면 바로 한 번 본다
    refetchOnWindowFocus: 'always',
  })
  const purpose = attempt.data?.purpose ?? context.purpose
  const status = attempt.data?.status
  const failed = isApiError(attempt.error) ? attempt.error.status : null

  // 다른 화면이 시도만 만들고 넘어온 경우 여기서 인증 창을 연다(한 번만)
  useEffect(() => {
    if (!context.authUrl || readAttemptContext(attemptId).opened) return
    writeAttemptContext(attemptId, { opened: true })
    openTossAuth(context.authUrl)
  }, [attemptId, context.authUrl])

  useEffect(() => {
    const leave = (to: string) => navigate(to, { replace: true })
    if (status === 'AUTHORIZED') leave(connectPath('select', attemptId, { returnTo }))
    else if (status === 'CONFIRMED') leave(connectPath('done', attemptId, { returnTo }))
    else if (status === 'FAILED') leave(originPath(purpose))
    else if (status === 'EXPIRED' || failed === 410) {
      toast.error('다시 시도해 주세요')
      leave(originPath(purpose))
    } else if (failed === 404) leave(originPath(purpose))
  }, [status, failed, attemptId, returnTo, purpose, navigate])

  return (
    <CloseOnboardingShell
      onClose={() => navigate(originPath(purpose), { replace: true })}
      progress={purpose === 'SIGNUP' ? 3 : undefined}
      footer={
        <Button
          type="secondary"
          size="l"
          label="토스 다시 열기"
          className="w-full"
          disabled={!context.authUrl}
          onClick={() => {
            if (context.authUrl && !external.openWindow(context.authUrl, TOSS_WINDOW_NAME)) external.assign(context.authUrl)
          }}
        />
      }
    >
      <div role="status" className="flex flex-1 flex-col">
        <ConnectStatus illust={<IllustLinking phase="pending" width={240} />} title="토스에서 인증 중" />
      </div>
    </CloseOnboardingShell>
  )
}
