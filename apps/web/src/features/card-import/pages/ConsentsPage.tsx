import { useState } from 'react'
import { Navigate } from 'react-router'
import type { RevocableConsent, RevocableConsentId } from '@yeojeong/shared'
import { paths } from '../../../app/paths'
import { ErrorScreen } from '../../../app/states'
import { Button, Dialog, ShellSub } from '../../../ds'
import { toast } from '../../../notifications'
import { kst } from '../../payments/rules'
import { useBack } from '../../wallet/useBack'
import { CONSENT_LABELS, COPY } from '../copy'
import { useRevocableConsents, useWithdrawConsent } from '../hooks'

/**
 * WF-58 동의 관리 · WF-58b 철회 확인. 기능 플래그와 무관하다(서버 revocable·withdraw도 무관).
 * 유효 동의가 0건이면(처음부터 또는 철회 뒤) HF-30으로 돌려보낸다. 철회해도 저장한 지갑 항목은 그대로다
 */
export default function ConsentsPage() {
  const back = useBack(paths.me())
  const consents = useRevocableConsents()
  const withdraw = useWithdrawConsent()
  const [target, setTarget] = useState<RevocableConsentId | null>(null)

  const confirm = () => {
    if (!target || withdraw.isPending) return
    withdraw.mutate(target, {
      onSuccess: () => {
        setTarget(null)
        toast.success(COPY.withdrawn)
      },
      onError: () => {
        setTarget(null)
        toast.error(COPY.later)
      },
    })
  }

  return (
    <ShellSub header={{ title: COPY.consentsTitle, onBack: back }}>
      {consents.isPending ? (
        <div role="status" aria-label="불러오는 중" aria-busy="true" className="flex flex-col gap-1.5 py-2">
          <span className="h-5 w-36 animate-pulse rounded-sm bg-subtle" />
          <span className="h-4 w-24 animate-pulse rounded-sm bg-subtle" />
        </div>
      ) : consents.isError ? (
        <ErrorScreen error={consents.error} onRetry={() => void consents.refetch()} />
      ) : consents.data.length === 0 ? (
        <Navigate replace to={paths.me()} />
      ) : (
        <ul className="flex flex-col">
          {consents.data.map((c) => (
            <ConsentRow key={c.consentId} consent={c} onWithdraw={() => setTarget(c.consentId)} />
          ))}
        </ul>
      )}
      {/* WF-58b */}
      <Dialog
        open={target !== null}
        title={COPY.withdrawTitle}
        message={COPY.withdrawMessage}
        confirmLabel={COPY.withdraw}
        confirmState={withdraw.isPending ? 'loading' : 'default'}
        onCancel={() => !withdraw.isPending && setTarget(null)}
        onConfirm={confirm}
      />
    </ShellSub>
  )
}

function ConsentRow({ consent, onWithdraw }: { consent: RevocableConsent; onWithdraw: () => void }) {
  const label = CONSENT_LABELS[consent.consentId] ?? consent.title
  const agreed = kst(consent.agreedAt).date.replaceAll('-', '.')
  return (
    <li className="flex items-center gap-3 py-2">
      <span className="flex min-w-0 flex-1 flex-col gap-0.5">
        <span className="truncate text-body-m text-primary">{label}</span>
        <span className="text-caption text-tertiary">{COPY.consentAgreedAt(agreed)}</span>
      </span>
      <Button type="ghost" size="s" label={COPY.withdraw} aria-label={`${label} ${COPY.withdraw}`} onClick={onWithdraw} className="-mr-2" />
    </li>
  )
}
