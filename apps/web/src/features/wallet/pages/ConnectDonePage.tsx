import { useQuery } from '@tanstack/react-query'
import { useState } from 'react'
import { Navigate, useNavigate, useSearchParams } from 'react-router'
import { paths, safeReturnTo } from '../../../app/paths'
import { IllustLinked, ShellOnboarding } from '../../../ds'
import { attemptQuery } from '../api'
import { ConnectStatus } from '../components/ConnectStatus'
import { finishPath, readAttemptContext } from '../connect'
import { formatMethodCounts } from '../format'

/** WF-08 연결 완료. 가입 흐름 "여정으로 가기"(returnTo 또는 진입 라우팅), 지갑·재연결 흐름 "확인"(returnTo 또는 지갑) */
export default function ConnectDonePage() {
  const [params] = useSearchParams()
  const attemptId = params.get('attempt')
  if (!attemptId) return <Navigate replace to={paths.wallet()} />
  return <ConnectDone key={attemptId} attemptId={attemptId} returnTo={safeReturnTo(params.get('returnTo'))} />
}

function ConnectDone({ attemptId, returnTo }: { attemptId: string; returnTo: string | null }) {
  const navigate = useNavigate()
  const [context] = useState(() => readAttemptContext(attemptId))
  const attempt = useQuery({ ...attemptQuery(attemptId), enabled: !context.purpose })
  const purpose = context.purpose ?? attempt.data?.purpose
  const signup = purpose === 'SIGNUP'
  const counts = context.result ? formatMethodCounts(context.result.accounts, context.result.cards) : ''

  return (
    <ShellOnboarding
      back={false}
      progress={signup ? 4 : undefined}
      cta={{
        label: signup ? '여정으로 가기' : '확인',
        disabled: !purpose,
        onClick: () => navigate(finishPath(purpose, returnTo), { replace: true }),
      }}
    >
      <ConnectStatus illust={<IllustLinked size={168} />} title="연결 완료" sub={counts || undefined} />
    </ShellOnboarding>
  )
}
