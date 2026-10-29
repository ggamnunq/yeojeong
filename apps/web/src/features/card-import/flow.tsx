import type { ComponentType } from 'react'
import { Navigate, useLocation, useNavigate } from 'react-router'
import { paths } from '../../app/paths'
import { useCardImportEnabled } from './hooks'

// 카드 내역 불러오기 흐름(WF-51~57)의 이동 규칙.
// - 흐름은 history 한 칸이다: 지갑에서 들어올 때만 push하고, 흐름 안 이동(51 → 52 → 53, ‹)은 replace한다.
//   그래서 브라우저 뒤로 가기·완료는 바로 지갑(WF-49)으로 돌아간다.
// - history state에는 흐름 표시(boolean)만 둔다. 아이디·비밀번호·결과는 넣지 않는다(화면명세 L-0 메모리 규칙).

export type CardImportFlowState = { cardImportFlow: true; fromWallet?: boolean }

const flowStateOf = (state: unknown): CardImportFlowState | null =>
  state && typeof state === 'object' && (state as CardImportFlowState).cardImportFlow === true ? (state as CardImportFlowState) : null

/** 지갑(WF-49)에서 흐름을 시작할 때 넘기는 state */
export const startFlowState: CardImportFlowState = { cardImportFlow: true, fromWallet: true }

export function useFlowNav() {
  const navigate = useNavigate()
  const location = useLocation()
  const state = flowStateOf(location.state)
  const fromWallet = state?.fromWallet === true
  return {
    /** 흐름 표시가 있는가(새로고침·직접 진입이면 false) */
    inFlow: state !== null,
    /** 흐름 안 다음·이전 단계(replace) */
    go: (to: string) => void navigate(to, { replace: true, state: { cardImportFlow: true, fromWallet } satisfies CardImportFlowState }),
    /** 흐름을 끝내고 지갑으로 */
    exit: () => void (fromWallet ? navigate(-1) : navigate(paths.wallet(), { replace: true })),
    /** "직접 추가": 지갑 + 결제 추가 시트(WF-48). 시트를 닫으면 지갑으로 돌아간다 */
    manual: () => void navigate(paths.walletNew(), { replace: true, state: { fromList: fromWallet } }),
  }
}

/** features.cardImport가 꺼져 있으면(또는 운영 빌드에 공개키 지문이 없으면) 지갑으로(화면명세 0-11) */
export function cardImportOnly(Page: ComponentType, options: { requireFlow?: boolean } = {}): ComponentType {
  function CardImportOnly() {
    const enabled = useCardImportEnabled()
    const location = useLocation()
    if (!enabled) return <Navigate replace to={paths.wallet()} />
    // 새로고침·직접 진입으로 흐름 상태를 잃으면 처음(WF-51)부터
    if (options.requireFlow && !flowStateOf(location.state)) return <Navigate replace to={paths.walletImport()} />
    return <Page />
  }
  CardImportOnly.displayName = `CardImportOnly(${Page.displayName ?? Page.name ?? 'Page'})`
  return CardImportOnly
}
