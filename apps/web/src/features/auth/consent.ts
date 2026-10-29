import { useMemo } from 'react'
import { useNavigate } from 'react-router'
import type { SheetContentConsentItem } from '../../ds'
import { consentDocHref } from './api'
import { useFlowState } from './historyState'
import type { ConsentAgreement, ConsentDocument, ConsentMethod } from './types'

/**
 * 동의 문서 → DS Row/Consent 행(SheetContent/Consent items). ›(전문)는 앱 안 이동이라 라우터로 연다.
 * 체크는 이 history 항목에 남으므로 전문을 보고 돌아와도 그대로다.
 */
export function useConsentItems(docs: readonly ConsentDocument[], checked: ReadonlySet<string>): SheetContentConsentItem[] {
  const navigate = useNavigate()
  return docs.map((doc) => {
    const href = consentDocHref(doc)
    return {
      id: doc.consentId,
      title: doc.title,
      required: doc.required,
      checked: checked.has(doc.consentId),
      chevron: href
        ? {
            label: `${doc.title} 전문`,
            href,
            onClick: (event) => {
              event.preventDefault()
              void navigate(href)
            },
          }
        : undefined,
    }
  })
}

/**
 * 동의 체크 상태. 지금 history 항목(location.state)에 두어 전문을 보고 돌아와도 남는다.
 * method: 마지막 조작이 전체 동의면 ALL, 행 체크면 INDIVIDUAL(UserConsent.method).
 */
export function useConsentChecks(docs: readonly ConsentDocument[]) {
  const { state, patch } = useFlowState()
  const checked = useMemo(() => new Set(state.checked ?? []), [state.checked])
  const method: ConsentMethod = state.method ?? 'INDIVIDUAL'

  const toggleAll = (next: boolean) => patch({ checked: next ? docs.map((d) => d.consentId) : [], method: 'ALL' })
  const toggle = (consentId: string, next: boolean) => {
    const set = new Set(checked)
    if (next) set.add(consentId)
    else set.delete(consentId)
    patch({ checked: [...set], method: 'INDIVIDUAL' })
  }
  const reset = () => patch({ checked: [], method: undefined })

  /** 필수 항목을 모두 체크했는가(버튼 활성 조건) */
  const requiredDone = docs.length > 0 && docs.filter((d) => d.required).every((d) => checked.has(d.consentId))
  const agreements = (): ConsentAgreement[] =>
    docs.map((d) => ({ consentId: d.consentId, version: d.version, agreed: checked.has(d.consentId) }))

  return { checked, method, toggleAll, toggle, reset, requiredDone, agreements }
}
