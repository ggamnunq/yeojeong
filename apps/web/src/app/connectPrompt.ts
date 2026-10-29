// 지갑 연결로 이어 가야 하는 403 CONSENT_REQUIRED(연동 동의 FIN_* 누락 · 결제수단 0개 NO_ACTIVE_PAYMENT_METHOD)를
// 어느 화면에서 받든 같은 흐름으로 잇는다(화면명세 0-6): 연동 동의가 빠졌으면 WF-05b 동의 시트, 동의는 유효하고
// 결제수단만 없으면 WF-28 계좌·카드 추가 시트. 화면은 그대로 두고 그 위에 시트를 띄운다. 토스트·안내 문구 없음.
// SessionBridge가 열고, 루트 레이아웃의 FinConnectHost(features/wallet)가 그린다.

export type ConnectPrompt = 'consent' | 'add' | null

let current: ConnectPrompt = null
const listeners = new Set<() => void>()

const set = (next: ConnectPrompt) => {
  if (current === next) return
  current = next
  for (const listener of listeners) listener()
}

export const connectPrompt = {
  get: (): ConnectPrompt => current,
  subscribe(listener: () => void) {
    listeners.add(listener)
    return () => void listeners.delete(listener)
  },
  /** missing(유효하지 않은 연동 동의)가 있으면 동의 시트, 없으면 계좌·카드 추가 */
  open: (missing: readonly string[]) => set(missing.length > 0 ? 'consent' : 'add'),
  close: () => set(null),
}
