import { useEffect, type ComponentType } from 'react'
import { Navigate, useLocation, useNavigate } from 'react-router'
import { paths } from '../../app/paths'
import { useCardImportEnabled } from './hooks'

// 카드 내역 불러오기 흐름(WF-51~57)의 이동 규칙.
// - 흐름은 history 한 칸이다: 지갑에서 들어올 때만 push하고, 흐름 안 이동(51 → 52 → 53, ‹)은 replace한다.
//   그래서 브라우저 뒤로 가기·완료는 바로 지갑(WF-49)으로 돌아간다. (예외: WF-51 동의 행 › 전문은 push — 전문 ‹가 WF-51로 돌아온다)
// - history state에는 흐름 표시(boolean)와 흐름 nonce만 둔다. 아이디·비밀번호·결과는 넣지 않는다(화면명세 L-0 메모리 규칙).
// - 흐름 nonce: history state는 새로고침·다른 사이트에 갔다 뒤로(bfcache 아님)에도 복원되지만 화면 메모리는 비어 있다.
//   그래서 흐름 표시는 이 페이지 메모리의 nonce와 같을 때만 유효하고, 다르면 WF-51부터 다시 시작한다(빈 WF-53을 보이지 않는다).
//   nonce는 지갑에서 새로 들어올 때와 흐름을 끝낼 때(exit · manual — 흐름 화면이 내려간 뒤) 바뀐다.

export type CardImportFlowState = { cardImportFlow: true; nonce: string; fromWallet?: boolean }

/**
 * 이 페이지 메모리의 흐름 하나. agreed = WF-51 동의 체크(전문을 보고 돌아와도 유지, 민감 값 아님).
 * ending = exit · manual을 눌렀다 — 흐름 화면이 내려갈 때 nonce를 바꾼다(이동 중에 다시 그려지며 WF-51로 튀지 않게)
 */
type FlowSession = { nonce: string; agreed: boolean; ending: boolean }

const randomNonce = () => {
  const bytes = new Uint8Array(16)
  crypto.getRandomValues(bytes)
  return Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('')
}

let session: FlowSession = { nonce: randomNonce(), agreed: false, ending: false }
const renewSession = () => {
  session = { nonce: randomNonce(), agreed: false, ending: false }
}

/** history state가 흐름 표시처럼 생겼는가(nonce는 보지 않는다) */
const rawFlowStateOf = (state: unknown): Partial<CardImportFlowState> | null =>
  state && typeof state === 'object' && (state as CardImportFlowState).cardImportFlow === true ? (state as CardImportFlowState) : null

/** 지금 메모리의 흐름에서 만든 흐름 표시일 때만 */
const flowStateOf = (state: unknown): CardImportFlowState | null => {
  const raw = rawFlowStateOf(state)
  return raw && raw.nonce === session.nonce ? (raw as CardImportFlowState) : null
}

const currentFlowState = (fromWallet: boolean): CardImportFlowState => ({ cardImportFlow: true, nonce: session.nonce, fromWallet })

/** 지갑(WF-49)에서 흐름을 시작할 때 넘기는 state — 새 흐름(nonce)을 연다 */
export function startFlowState(): CardImportFlowState {
  renewSession()
  return currentFlowState(true)
}

export function useFlowNav() {
  const navigate = useNavigate()
  const location = useLocation()
  const state = flowStateOf(location.state)
  // 지갑에서 push로 들어왔는지는 history 칸의 사실이라 nonce가 바뀌어도(새로고침) 그대로 본다 — 뒤로 가면 그 지갑 칸이다
  const fromWallet = rawFlowStateOf(location.state)?.fromWallet === true
  const end = () => {
    session.ending = true
  }
  return {
    /** 흐름 표시가 있는가(새로고침·직접 진입이면 false) */
    inFlow: state !== null,
    /** 흐름 안 <Navigate>에 넘길 state(지금 흐름 nonce) */
    navState: (): CardImportFlowState => currentFlowState(fromWallet),
    /** WF-51 동의 체크(지금 흐름에서 이미 체크했으면 true — 전문을 보고 돌아온 경우) */
    agreed: state !== null && session.agreed,
    rememberAgreed: (agreed: boolean) => {
      session.agreed = agreed
    },
    /** 흐름 안 다음·이전 단계(replace) */
    go: (to: string) => void navigate(to, { replace: true, state: currentFlowState(fromWallet) }),
    /** 흐름을 끝내고 지갑으로 */
    exit: () => {
      end()
      void (fromWallet ? navigate(-1) : navigate(paths.wallet(), { replace: true }))
    },
    /** "직접 추가": 지갑 + 결제 추가 시트(WF-48). 시트를 닫으면 지갑으로 돌아간다 */
    manual: () => {
      end()
      void navigate(paths.walletNew(), { replace: true, state: { fromList: fromWallet } })
    },
  }
}

/** features.cardImport가 꺼져 있으면(또는 운영 빌드에 공개키 지문이 없으면) 지갑으로(화면명세 0-11) */
export function cardImportOnly(Page: ComponentType, options: { requireFlow?: boolean } = {}): ComponentType {
  function CardImportOnly() {
    const enabled = useCardImportEnabled()
    const location = useLocation()
    // exit · manual로 흐름을 끝냈으면 화면이 내려간 뒤 nonce를 바꾼다 — 앞으로 가기로 옛 흐름 칸에 와도 WF-51부터
    useEffect(
      () => () => {
        if (session.ending) renewSession()
      },
      [],
    )
    if (!enabled) return <Navigate replace to={paths.wallet()} />
    // 새로고침·직접 진입·떠났다 돌아오기로 흐름 메모리를 잃으면(nonce 불일치) 처음(WF-51)부터
    if (options.requireFlow && !flowStateOf(location.state)) {
      const fromWallet = rawFlowStateOf(location.state)?.fromWallet === true
      return <Navigate replace to={paths.walletImport()} state={currentFlowState(fromWallet)} />
    }
    return <Page />
  }
  CardImportOnly.displayName = `CardImportOnly(${Page.displayName ?? Page.name ?? 'Page'})`
  return CardImportOnly
}
