import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Navigate, useNavigate, useSearchParams } from 'react-router'
import { keys } from '../../../api'
import { paths, safeReturnTo } from '../../../app/paths'
import { useSession } from '../../../app/session'
import { ErrorScreen, LoadingScreen } from '../../../app/states'
import { SheetContentConsent, ShellOnboarding } from '../../../ds'
import { forgetInvites } from '../../trips/pendingInvite'
import { consentDocumentsQuery, postLogout, postReconsent, visibleConsents } from '../api'
import { useConsentChecks, useConsentItems } from '../consent'
import { COPY } from '../copy'

/**
 * 재동의(부록 C-14, FR-107). WF-04 틀을 다시 쓰되 ‹·진행 막대 없음, 다시 받아야 할 항목만.
 * 항목: ?required= (403 CONSENT_REQUIRED → SessionBridge) ∪ 세션 응답의 reconsentRequired(서버 1차). 둘 다 없으면 가입 필수 항목 전부.
 * 거부 수단은 로그아웃뿐이다.
 */
export default function ReconsentPage() {
  const session = useSession()
  const [params] = useSearchParams()
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const documents = useQuery(consentDocumentsQuery('SIGNUP'))

  const returnTo = safeReturnTo(params.get('returnTo'))
  const destination = returnTo && !returnTo.startsWith('/reconsent') ? returnTo : paths.splash()
  const required = new Set([
    ...(params.get('required') ?? '').split(',').filter(Boolean),
    ...(session.reconsentRequired ?? []),
  ])
  const signupDocs = visibleConsents(documents.data)
  const matched = signupDocs.filter((d) => required.has(d.consentId))
  const docs = matched.length > 0 ? matched : signupDocs.filter((d) => d.required)
  const consent = useConsentChecks(docs)
  const items = useConsentItems(docs, consent.checked)

  const agree = useMutation({
    mutationFn: postReconsent,
    onSuccess: async () => {
      // 세션을 다시 받은 뒤 이동해야 가드가 이 화면으로 되돌려 보내지 않는다
      await queryClient.invalidateQueries({ queryKey: keys.session })
      navigate(destination, { replace: true })
    },
  })

  const logout = useMutation({
    mutationFn: postLogout,
    onSuccess: () => {
      queryClient.clear()
      forgetInvites()
      navigate(paths.login(), { replace: true })
    },
  })

  if (session.isPending) return <LoadingScreen />
  if (session.error) return <ErrorScreen error={session.error} onRetry={session.refetch} />
  if (session.signupRequired) return <Navigate replace to={paths.signupNickname()} />
  if (!session.isAuthenticated) return <Navigate replace to={paths.login()} />
  if (required.size === 0 && !agree.isPending) return <Navigate replace to={destination} />
  if (documents.error) return <ErrorScreen error={documents.error} onRetry={() => void documents.refetch()} />

  const busy = agree.isPending || logout.isPending

  return (
    <ShellOnboarding
      back={false}
      cta={{
          label: COPY.agree,
          disabled: !consent.requiredDone || logout.isPending,
          onClick: () => agree.mutate({ agreements: consent.agreements(), method: consent.method }),
          state: agree.isPending ? 'loading' : 'default',
        }}
    >
      <h1 className="text-h1 text-primary">{COPY.reconsentTitle}</h1>
      <SheetContentConsent
        className="pt-8"
        items={items}
        onToggle={consent.toggle}
        onToggleAll={consent.toggleAll}
        loading={documents.isPending}
      />
      <div className="flex-1" />
      {/* 동의하지 않으면 로그아웃 또는 탈퇴(약관 제3조⑤). 탈퇴 화면(HF-59)은 재동의 전에도 열린다 */}
      <div className="flex justify-center gap-1 pb-1">
        <button
          type="button"
          disabled={busy}
          onClick={() => logout.mutate()}
          className="rounded-sm px-2 pt-2.5 pb-1.5 text-body-s text-tertiary focus-visible:shadow-focus-ring focus-visible:outline-hidden disabled:text-disabled"
        >
          {COPY.logout}
        </button>
        <button
          type="button"
          disabled={busy}
          onClick={() => navigate(paths.meWithdraw())}
          className="rounded-sm px-2 pt-2.5 pb-1.5 text-body-s text-tertiary focus-visible:shadow-focus-ring focus-visible:outline-hidden disabled:text-disabled"
        >
          {COPY.withdraw}
        </button>
      </div>
    </ShellOnboarding>
  )
}
