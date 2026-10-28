import type { ReactNode } from 'react'
import { isApiError } from '../api/client'
import { COPY, errorMessage, shortRequestId } from '../api/messages'
import { Button, EmptyState } from '../ds'
import { isChunkLoadError } from './chunkError'

export type ErrorFallbackProps = {
  error: unknown
  /** 「다시 시도」: 경계를 초기화하고 다시 그린다 */
  onRetry: () => void
  /** 「새로고침」(chunk 로드 실패). 기본은 location.reload() */
  onReload?: () => void
}

/** 화면을 그리다 실패했을 때 보여 주는 화면. 옛 번들 chunk 실패면 새로고침을, 그 밖에는 다시 시도를 권한다 */
export function ErrorFallback({ error, onRetry, onReload = () => window.location.reload() }: ErrorFallbackProps) {
  if (isChunkLoadError(error)) {
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

  const requestId = isApiError(error) ? error.requestId : undefined
  return (
    <FallbackShell>
      <EmptyState
        type="no-trip"
        title={COPY.boundaryTitle}
        message={
          <>
            {isApiError(error) ? errorMessage(error) : COPY.boundaryMessage}
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
