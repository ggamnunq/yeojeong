import { useMutation, useQuery } from '@tanstack/react-query'
import { useState } from 'react'
import { BottomSheet, Checkbox, Divider } from '../../../ds'
import { finConsentDocumentsQuery, saveFinConsents } from '../api'
import { FIN_CONSENT_IDS, type FinConsentId } from '../types'
import type { FinConsentSheetProps } from '../consent'

// TODO(W3A 통합): 금융정보 연동 동의 시트(HF-05b)는 W3A가 /signup/wallet에 만든다. 통합할 때 consent.ts의 FinConsentSheet를
// W3A 컴포넌트로 바꾸고 이 파일을 지운다. 그때까지 지갑 흐름이 끊기지 않게 하는 임시 시트다(행 › 전문 링크 없음).

const TITLES = {
  FIN_LINK: '금융정보 연동 약관',
  FIN_PRIVACY: '금융정보 수집·이용',
  THIRD_PARTY: '공동 결제 그룹 공개',
} satisfies Record<FinConsentId, string>

export function TempFinConsentSheet({ open, screen, onClose, onAgreed }: FinConsentSheetProps) {
  const [checked, setChecked] = useState<ReadonlySet<FinConsentId>>(new Set())
  const [method, setMethod] = useState<'ALL' | 'INDIVIDUAL'>('INDIVIDUAL')
  const documents = useQuery({ ...finConsentDocumentsQuery(), enabled: open })
  const save = useMutation({ mutationFn: saveFinConsents })

  const all = FIN_CONSENT_IDS.every((id) => checked.has(id))
  const version = (id: FinConsentId) => documents.data?.find((d) => d.consentId === id)?.version

  const toggle = (id: FinConsentId) => {
    setMethod('INDIVIDUAL')
    setChecked((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  const close = () => {
    setChecked(new Set())
    onClose()
  }

  return (
    <BottomSheet
      open={open}
      onClose={close}
      title="금융정보 연동 동의"
      cta={{
        label: '동의하고 연결',
        disabled: !all || !documents.data || save.isPending,
        onClick: () =>
          save.mutate(
            {
              stage: 'FIN_LINK',
              agreements: FIN_CONSENT_IDS.map((consentId) => ({ consentId, version: version(consentId) ?? '', agreed: true })),
              method,
              screen,
            },
            {
              onSuccess: () => {
                setChecked(new Set())
                onAgreed()
              },
            },
          ),
      }}
    >
      <div className="flex flex-col">
        <Checkbox
          label={<span className="text-body-l-strong">전체 동의</span>}
          checked={all}
          onChange={() => {
            setMethod('ALL')
            setChecked(all ? new Set() : new Set(FIN_CONSENT_IDS))
          }}
        />
        <Divider type="full" className="my-2" />
        {FIN_CONSENT_IDS.map((id) => (
          <Checkbox key={id} label={`[필수] ${TITLES[id]}`} checked={checked.has(id)} onChange={() => toggle(id)} />
        ))}
      </div>
    </BottomSheet>
  )
}
