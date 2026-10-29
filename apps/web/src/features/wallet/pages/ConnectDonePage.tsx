import { useQuery } from '@tanstack/react-query'
import { useEffect, useState } from 'react'
import { Navigate, useNavigate, useSearchParams } from 'react-router'
import { paths, safeReturnTo } from '../../../app/paths'
import { markSignupConnected, takeSignupReturnTo } from '../../../app/signupReturnTo'
import { IllustLinked, ShellOnboarding } from '../../../ds'
import { attemptQuery } from '../api'
import { ConnectStatus } from '../components/ConnectStatus'
import { finishPath, readAttemptContext } from '../connect'
import { formatMethodCounts } from '../format'

/**
 * WF-08 연결 완료. 가입 흐름 "여정으로 가기"(가입 전 열려던 경로 또는 진입 라우팅), 지갑·재연결 흐름 "확인"(returnTo 또는 지갑).
 * 연결은 이미 끝났으니 브라우저 뒤로 가기도 버튼과 같다(화면명세 WF-08 v0.5.8) — 연결 단계(WF-06·07)는 replace로 이미 지워졌고,
 * 그 아래 토스 안내(WF-05)는 「연결 완료」 표시를 보고 같은 곳으로 바꾼다(SignupWalletPage)
 */
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
  const finish = () => {
    const to = returnTo ?? (signup ? takeSignupReturnTo() : null)
    markSignupConnected(false)
    return navigate(finishPath(purpose, to), { replace: true })
  }

  // 가입 흐름: 뒤로 가기로 WF-05에 가도 버튼과 같은 곳으로 가게 표시해 둔다
  useEffect(() => {
    if (signup) markSignupConnected(true)
  }, [signup])

  return (
    <ShellOnboarding
      back={false}
      progress={signup ? 4 : undefined}
      cta={{
        label: signup ? '여정으로 가기' : '확인',
        disabled: !purpose,
        onClick: () => void finish(),
      }}
    >
      <ConnectStatus illust={<IllustLinked size={168} />} title="연결 완료" sub={counts || undefined} />
    </ShellOnboarding>
  )
}
