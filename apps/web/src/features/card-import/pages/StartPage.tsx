import { useState } from 'react'
import { Navigate } from 'react-router'
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
 */
export default function StartPage() {
  const flow = useFlowNav()
  const config = useCardImportConfig()
  const consent = useCardImportConsent()
  const [agreed, setAgreed] = useState(false)

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
            chevron={{ label: COPY.consentDoc, href: paths.consent('CARD_IMPORT') }}
          />
        )}
      </div>
      <div aria-hidden className="min-h-10 flex-1" />
      <QuietButton onClick={flow.manual}>{COPY.manual}</QuietButton>
    </ShellSub>
  )
}
