import { useState, type MouseEvent } from 'react'
import { Navigate, useNavigate } from 'react-router'
import { isApiError } from '../../../api'
import { paths } from '../../../app/paths'
import { Icon, RowConsent, ShellSub, type IconName } from '../../../ds'
import { toast } from '../../../notifications'
import { ImportErrorScreen, QuietButton } from '../components'
import { COPY } from '../copy'
import { useFlowNav } from '../flow'
import { useCardImportConfig, useCardImportConsent } from '../hooks'

/**
 * WF-51 시작 전 확인: 사실 3줄(매번) + 동의 행(유효 동의가 없을 때만, 최초 1회) → "계속" → WF-52.
 * remainingToday = 0이면 WF-51 대신 WF-57d(오늘 한도 소진)를 그린다(WF-49 "불러오기"에서 바로).
 * 동의 행 ›(전문)는 앱 안 이동(push)이다 — 전문 ‹가 이 화면으로 돌아오고, 흐름과 체크는 메모리(flow)에 남아 있다.
 */
export default function StartPage() {
  const flow = useFlowNav()
  const config = useCardImportConfig()
  const consent = useCardImportConsent()
  const navigate = useNavigate()
  // 전문을 보고 돌아오면 지금 흐름의 체크를 그대로(새로고침·새 흐름이면 처음부터)
  const [agreed, setAgreedState] = useState(flow.agreed)
  const setAgreed = (value: boolean) => {
    setAgreedState(value)
    flow.rememberAgreed(value)
  }
  // 전체 새로고침(href 기본 동작)이 아니라 라우터로 이동한다. 새 탭 열기(보조 키·가운데 버튼)는 브라우저에 맡긴다
  const openDoc = (event: MouseEvent<HTMLElement>) => {
    if (event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return
    event.preventDefault()
    void navigate(paths.consent('CARD_IMPORT'))
  }

  if (isApiError(config.error) && config.error.code === 'NOT_FOUND') return <Navigate replace to={paths.wallet()} />
  if (config.data?.remainingToday === 0) {
    return <ImportErrorScreen kind="daily" title={COPY.title} orgName="" onBack={flow.exit} onManual={flow.manual} />
  }

  // 조회 실패면 동의 행을 보인다(다시 동의 받음). 조회 중이면 자리만 비워 둔다
  const needConsent = config.isError || (config.data !== undefined && !config.data.consent.valid)
  const version = config.data?.consent.required.find((r) => r.id === 'CARD_IMPORT')?.version
  const ready = (config.data !== undefined || config.isError) && (!needConsent || agreed)

  const next = () => {
    if (!config.data) {
      // 설정을 못 받았다 — 다시 받고 안내
      void config.refetch()
      return void toast.error(COPY.later)
    }
    if (!needConsent) return flow.go(paths.walletImportIssuer())
    if (!agreed || !version || consent.isPending) return
    consent.mutate(version, {
      onSuccess: () => flow.go(paths.walletImportIssuer()),
      onError: () => void toast.error(COPY.later),
    })
  }

  return (
    <ShellSub
      header={{ title: COPY.title, onBack: flow.exit }}
      cta={{
        label: COPY.next,
        onClick: next,
        state: consent.isPending ? 'loading' : ready ? 'default' : 'disabled',
      }}
    >
      <ul className="mt-2 flex flex-col gap-5">
        {COPY.facts.map((fact) => (
          <li key={fact.strong} className="flex items-center gap-3.5">
            <span className="flex size-10 shrink-0 items-center justify-center rounded-full bg-subtle">
              <Icon name={fact.icon as IconName} size={20} className="text-icon-default" />
            </span>
            <span className="text-body-m text-primary">
              <strong className="font-semibold">{fact.strong}</strong>
              {fact.rest}
            </span>
          </li>
        ))}
      </ul>
      <div className="mt-8 min-h-13">
        {needConsent && (
          <RowConsent
            title={COPY.consent}
            checked={agreed}
            onChange={(e) => setAgreed(e.target.checked)}
            chevron={{ label: COPY.consentDoc, href: paths.consent('CARD_IMPORT'), onClick: openDoc }}
          />
        )}
      </div>
      <div aria-hidden className="min-h-10 flex-1" />
      <QuietButton onClick={flow.manual}>{COPY.manual}</QuietButton>
    </ShellSub>
  )
}
