import { Component, type ReactNode } from 'react'
import { ErrorFallback } from './ErrorFallback'

export type ErrorBoundaryProps = {
  children: ReactNode
  /** 「다시 시도」로 초기화할 때 같이 부른다(main.tsx는 TanStack Query의 QueryErrorResetBoundary reset을 넘긴다) */
  onReset?: () => void
  /** 기본은 ErrorFallback */
  fallback?: (props: { error: unknown; reset: () => void }) => ReactNode
}

type ErrorBoundaryState = { failed: boolean; error: unknown }

/**
 * 렌더링 중 던진 에러를 잡아 대체 화면을 보여 준다. 이벤트 핸들러·비동기 에러는 잡지 않는다
 * (API 실패는 TanStack Query + 전역 토스트가 맡는다). 잡은 에러는 React가 콘솔에 남긴다.
 */
export class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  state: ErrorBoundaryState = { failed: false, error: null }

  static getDerivedStateFromError(error: unknown): ErrorBoundaryState {
    return { failed: true, error }
  }

  reset = () => {
    this.props.onReset?.()
    this.setState({ failed: false, error: null })
  }

  render() {
    if (!this.state.failed) return this.props.children
    const { fallback } = this.props
    const { error } = this.state
    return fallback ? fallback({ error, reset: this.reset }) : <ErrorFallback error={error} onRetry={this.reset} />
  }
}
