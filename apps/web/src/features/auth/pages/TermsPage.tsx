import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useEffect, useState } from 'react'
import { Link, Navigate } from 'react-router'
import { errorMessage, fieldErrors, isApiError, keys, type SessionResponse } from '../../../api'
import { accountLinkOf } from '../../../app/features'
import { paths } from '../../../app/paths'
import { useSession } from '../../../app/session'
import { rememberSignupReturnTo, takeSignupReturnTo } from '../../../app/signupReturnTo'
import { ErrorScreen, LoadingScreen } from '../../../app/states'
import { SheetContentConsent, ShellOnboarding } from '../../../ds'
import { toast } from '../../../notifications'
import { consentDocumentsQuery, postSignup, visibleConsents } from '../api'
import { useConsentChecks, useConsentItems } from '../consent'
import { COPY } from '../copy'
import { useFlowState } from '../historyState'
import { signupProgress } from '../steps'

const preloadWallet = () => import('./SignupWalletPage')

/**
 * WF-04 약관 동의(HF-04, FR-104). 필수 3행(TOS·PRIVACY·AGE14) + 가입 요청.
 * 가입 뒤: 토스 연결 기능이 켜져 있으면 WF-05, 꺼져 있으면(기본, FR-006) 곧바로 returnTo 또는 진입 라우팅(가입 2단계)
 */
export default function TermsPage() {
  const { state, navigate, location } = useFlowState()
  const queryClient = useQueryClient()
  const documents = useQuery(consentDocumentsQuery('SIGNUP'))
  const docs = visibleConsents(documents.data)
  const consent = useConsentChecks(docs)
  const items = useConsentItems(docs, consent.checked)
  const [formError, setFormError] = useState<string | null>(null)
  const session = useSession()
  const nickname = state.nickname
  const accountLink = accountLinkOf(session.data)

  // 가입 직후 WF-05로 바로 넘어가도록 화면 코드를 미리 받아 둔다
  useEffect(() => {
    if (accountLink) void preloadWallet()
  }, [accountLink])

  const signup = useMutation({
    mutationFn: postSignup,
    onSuccess: ({ returnTo, ...me }) => {
      // 가입을 마친 뒤 갈 곳(서버 값이 기준). WF-05 「나중에」·WF-08 「여정으로 가기」가 꺼내 쓴다
      rememberSignupReturnTo(returnTo)
      // 세션을 로그인 상태로 바꾼 뒤 다음 화면(RequireAuth)으로 간다. 이동(lazy 화면 로딩)이 끝나기 전에 이 화면이
      // 새 세션으로 다시 그려져도 '/'로 보내면 안 되므로 이 화면은 RequireSignup 대신 아래에서 직접 가드한다.
      // 세션 응답의 나머지(features 등)는 그대로 둔다
      queryClient.setQueryData<SessionResponse>(keys.session, (prev) => ({
        ...prev,
        status: 'AUTHENTICATED',
        user: me,
        signupDraft: undefined,
      }))
      // 토스 연결이 꺼져 있으면 토스 안내(WF-05)·완료(WF-08) 없이 가입이 끝난다(가입 2단계, FR-006 AC1)
      if (accountLink) navigate(paths.signupWallet(), { replace: true })
      else navigate(takeSignupReturnTo() ?? paths.splash(), { replace: true })
    },
    onError: (error) => {
      const fields = fieldErrors(error)
      if (fields.nickname) {
        navigate(paths.signupNickname(), { replace: true, state: { nickname, nicknameError: fields.nickname } })
        return
      }
      if (!isApiError(error)) return
      if (error.code === 'UNAUTHENTICATED') {
        // 가입 티켓 만료(30분). 전역 처리기가 캐시를 비우지만 /signup/에서는 이동하지 않으니 여기서 보낸다
        toast.error(errorMessage(error))
        navigate(paths.login(), { replace: true })
      } else if ((error.code as string) === 'TERMS_REQUIRED') {
        consent.reset()
        void documents.refetch()
      } else if (error.code === 'VALIDATION_FAILED') {
        setFormError(errorMessage(error))
      }
    },
  })

  // RequireSignup과 같은 판단: 가입 티켓이 있는 사람만. 가입 요청 중·성공 직후(WF-05로 넘어가는 중)는 예외.
  // onSuccess가 도는 동안 mutation은 아직 pending이라 세션이 먼저 바뀌어도 여기서 '/'로 보내지 않는다
  if (!signup.isPending && !signup.isSuccess) {
    if (session.isPending) return <LoadingScreen />
    if (session.error) return <ErrorScreen error={session.error} onRetry={session.refetch} />
    if (!session.signupRequired) {
      return <Navigate replace to={session.isAuthenticated ? paths.splash() : paths.login()} />
    }
  }
  if (!nickname) return <Navigate replace to={paths.signupNickname()} />
  if (documents.error) return <ErrorScreen error={documents.error} onRetry={() => void documents.refetch()} />

  const back = () => {
    if (location.key !== 'default') navigate(-1)
    else navigate(paths.signupNickname(), { replace: true, state: { nickname } })
  }

  const submit = () => {
    setFormError(null)
    signup.mutate({ nickname, agreements: consent.agreements(), method: consent.method })
  }

  return (
    <ShellOnboarding
      {...signupProgress(2, accountLink)}
      onBack={back}
      cta={{ label: COPY.next, onClick: submit, disabled: !consent.requiredDone, state: signup.isPending ? 'loading' : 'default' }}
    >
      <h1 className="sr-only">약관 동의</h1>
      <h2 className="text-h1 text-primary">{COPY.termsTitle}</h2>
      <SheetContentConsent
        className="pt-8"
        items={items}
        onToggle={consent.toggle}
        onToggleAll={consent.toggleAll}
        loading={documents.isPending}
      />
      <div className="flex-1" />
      {formError && (
        <p role="alert" className="pb-2 text-center text-body-s text-error">
          {formError}
        </p>
      )}
      <div className="flex justify-center pb-1">
        <Link
          to={paths.privacy()}
          className="rounded-sm px-2 pt-2.5 pb-1.5 text-body-s text-tertiary focus-visible:shadow-focus-ring focus-visible:outline-hidden"
        >
          {COPY.privacyLink}
        </Link>
      </div>
    </ShellOnboarding>
  )
}
