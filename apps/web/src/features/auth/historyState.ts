import { useCallback } from 'react'
import { useLocation, useNavigate } from 'react-router'

// 화면 상태를 지금 history 항목(location.state)에 둔다. 전문 페이지에 갔다가 뒤로 오거나 새로고침해도
// 체크·입력값·열린 시트가 그대로 남는다(WF-04 "뒤로 오면 체크 유지", WF-05b "돌아오면 시트·체크 유지").

export type AuthFlowState = {
  /** WF-03에서 입력한 닉네임(WF-04가 가입 요청에 쓴다) */
  nickname?: string
  /** WF-04에서 WF-03으로 돌려보낼 때 서버 검증 오류 */
  nicknameError?: string
  /** 동의 체크(consentId 목록)와 마지막 조작 방식 */
  checked?: string[]
  method?: 'ALL' | 'INDIVIDUAL'
  /** WF-05b 시트가 열린 history 항목(열 때 push, 닫으면 뒤로) */
  finConsentSheet?: boolean
}

export function useFlowState() {
  const location = useLocation()
  const navigate = useNavigate()
  const state = (location.state ?? {}) as AuthFlowState

  /** 지금 항목의 state를 고친다(새 항목을 만들지 않는다) */
  const patch = useCallback(
    (next: Partial<AuthFlowState>) => {
      navigate(
        { pathname: location.pathname, search: location.search, hash: location.hash },
        { replace: true, preventScrollReset: true, state: { ...(location.state as AuthFlowState | null), ...next } },
      )
    },
    [navigate, location],
  )

  return { state, patch, location, navigate }
}
