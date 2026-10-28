import { isRouteErrorResponse, useLocation, useNavigate, useRouteError } from 'react-router'
import { Button, EmptyState } from '../ds'
import { ErrorFallback } from './ErrorFallback'
import { paths } from './paths'

// 공통 상태 화면(화면명세 0-6). 셸 안(헤더·하단 탭이 이미 그려진 곳)에서는 inset으로 본문 자리만 채운다.

export type StateScreenProps = {
  /** true면 셸 안 본문 자리만 채운다(min-h-svh 없음) */
  inset?: boolean
}

const SKELETON_ROWS = 6

/** 첫 로딩 스켈레톤. 리스트 행 6개 모양 */
export function LoadingScreen({ inset = false }: StateScreenProps) {
  return (
    <div
      role="status"
      aria-label="불러오는 중"
      aria-busy="true"
      className={
        inset
          ? 'flex flex-col gap-4 py-5'
          : 'mx-auto flex min-h-svh w-full max-w-screen-width flex-col gap-4 bg-canvas px-gutter py-5'
      }
    >
      {Array.from({ length: SKELETON_ROWS }, (_, i) => (
        <div key={i} className="flex items-center gap-3">
          <div className="size-9 shrink-0 animate-pulse rounded-full bg-muted motion-reduce:animate-none" />
          <div className="flex flex-1 flex-col gap-2">
            <div className="h-3.5 w-2/3 animate-pulse rounded-sm bg-muted motion-reduce:animate-none" />
            <div className="h-3 w-1/3 animate-pulse rounded-sm bg-muted motion-reduce:animate-none" />
          </div>
        </div>
      ))}
    </div>
  )
}

export type ErrorScreenProps = { error: unknown; onRetry: () => void }

/** 조회 실패 화면. ErrorBoundary와 같은 ErrorFallback(문의 번호·새 버전 안내 포함) */
export function ErrorScreen({ error, onRetry }: ErrorScreenProps) {
  return <ErrorFallback error={error} onRetry={onRetry} />
}

export function NotFoundScreen() {
  const navigate = useNavigate()
  return (
    <main className="mx-auto flex min-h-svh w-full max-w-screen-width flex-col justify-center bg-canvas">
      <EmptyState
        type="no-trip"
        title="페이지를 찾을 수 없어요"
        message=""
        actions={
          <Button type="primary" size="m" label="처음으로" className="w-full" onClick={() => navigate(paths.splash())} />
        }
      />
    </main>
  )
}

/** 라우터 errorElement. loader·렌더링 에러와 lazy chunk 실패를 받는다 */
export function RouteErrorScreen() {
  const error = useRouteError()
  const navigate = useNavigate()
  const location = useLocation()
  if (isRouteErrorResponse(error) && error.status === 404) return <NotFoundScreen />
  // 같은 주소로 다시 이동하면 라우트 에러가 풀리고 다시 그린다
  return <ErrorFallback error={error} onRetry={() => navigate(location, { replace: true })} />
}
