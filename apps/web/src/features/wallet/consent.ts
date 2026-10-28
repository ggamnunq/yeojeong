import type { ComponentType } from 'react'
import { TempFinConsentSheet } from './components/TempFinConsentSheet'
import type { FinConsentId, FinConsentScreen } from './types'

// 금융정보 연동 동의 시트(HF-05b) 자리. 지갑(WF-28 "연결" · WF-42 "다시 연결")이 403 CONSENT_REQUIRED(FIN_*)를 받으면 연다.
// TODO(W3A 통합): W3A가 만든 시트를 이 인터페이스로 import해 FinConsentSheet에 넣고 TempFinConsentSheet를 지운다.
//   import { FinConsentSheet as W3AFinConsentSheet } from '../auth/…'
//   export const FinConsentSheet: ComponentType<FinConsentSheetProps> = W3AFinConsentSheet

export type FinConsentSheetProps = {
  open: boolean
  /** 403 details의 빠진 동의 ID(FIN_LINK · FIN_PRIVACY · THIRD_PARTY). 시트는 3건을 모두 보여 준다 */
  required: readonly FinConsentId[]
  /** UserConsent.screen — 진입 화면 */
  screen: FinConsentScreen
  /** ✕ · 딤 · 뒤로 가기. 연결 시도는 만들지 않는다 */
  onClose: () => void
  /** POST /api/consents 성공 뒤. 지갑이 연결 요청을 다시 보낸다 */
  onAgreed: () => void
}

export const FinConsentSheet: ComponentType<FinConsentSheetProps> = TempFinConsentSheet
