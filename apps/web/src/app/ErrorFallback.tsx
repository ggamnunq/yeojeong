import { useEffect, useState, type ReactNode } from 'react'
import { isApiError } from '../api/client'
import { COPY, errorMessage, shortRequestId } from '../api/messages'
import { Button, EmptyState } from '../ds'
import { checkBuild } from './buildInfo'
import { isChunkLoadError } from './chunkError'
import { reportClientError } from './clientErrors'

export type ErrorFallbackProps = {
  error: unknown
  /** 「다시 시도」: 경계를 초기화하고 다시 그린다 */
  onRetry: () => void
  /** 「새로고침」(chunk 로드 실패·옛 번들). 기본은 location.reload() */
  onReload?: () => void
}

type BuildState = 'checking' | 'stale' | 'current'

/**
 * 화면을 그리다 실패했을 때 보여 주는 화면.
 * - chunk 로드 실패(옛 번들이 지워진 파일을 찾음): 바로 「새 버전이 나왔어요 · 새로고침」
 * - ApiError: 서버 문구 + 문의 번호, 「다시 시도」
 * - 그 밖의 에러: /version.json으로 배포된 빌드를 확인해(최대 3초) 이 탭과 다르면 「새 버전이 나왔어요」, 같거나 모르면 「문제가 생겼어요」
 * ApiError가 아닌 에러는 서버 로그로 보고한다(clientErrors.ts, 같은 오류는 세션당 한 번).
 */
export function ErrorFallback({ error, onRetry, onReload = () => window.location.reload() }: ErrorFallbackProps) {
  const chunk = isChunkLoadError(error)
  const api = isApiError(error)
  const [build, setBuild] = useState<{ error: unknown; state: BuildState }>({ error, state: 'checking' })
  const buildState: BuildState = build.error === error ? build.state : 'checking'

  useEffect(() => {
    if (api) return
    void reportClientError(error, 'boundary')
    if (chunk) return
    let active = true
    void checkBuild().then(({ freshness }) => {
      if (active) setBuild({ error, state: freshness === 'stale' ? 'stale' : 'current' })
    })
    return () => {
      active = false
    }
  }, [error, api, chunk])

  if (chunk || (!api && buildState === 'stale')) {
    return (
      <FallbackShell>
        <EmptyState
          type="no-trip"
          title={COPY.chunkTitle}
          message={COPY.chunkMessage}
          actions={<Button type="primary" size="m" label={COPY.reload} className="w-full" onClick={onReload} />}
        />
      </FallbackShell>
    )
  }

  // 배포된 빌드를 확인하는 동안(최대 3초)은 빈 화면. 「문제가 생겼어요」가 잠깐 보였다 바뀌지 않게 한다
  if (!api && buildState === 'checking') {
    return (
      <main className="mx-auto flex min-h-svh w-full max-w-screen-width flex-col justify-center bg-canvas">
        <div role="status" aria-label="확인하는 중" aria-busy="true" />
      </main>
    )
  }

  const requestId = api ? error.requestId : undefined
  return (
    <FallbackShell>
      <EmptyState
        type="no-trip"
        title={COPY.boundaryTitle}
        message={
          <>
            {api ? errorMessage(error) : COPY.boundaryMessage}
            {requestId && (
              <span className="mt-1 block text-caption text-tertiary">{COPY.requestId(shortRequestId(requestId))}</span>
            )}
          </>
        }
        actions={<Button type="primary" size="m" label={COPY.retry} className="w-full" onClick={onRetry} />}
      />
    </FallbackShell>
  )
}

function FallbackShell({ children }: { children: ReactNode }) {
  return (
    <main className="mx-auto flex min-h-svh w-full max-w-screen-width flex-col justify-center bg-canvas">
      <div role="alert">{children}</div>
    </main>
  )
}
