import { clsx } from 'clsx'
import type { ReactNode } from 'react'
import { Button } from '../../ds'

// 현황·정산 화면이 같이 쓰는 작은 조각(하이파이 패턴: 섹션 라벨 · 화면 오류 · 스켈레톤).

/** 섹션 라벨(Body/S Strong · text/secondary). 화면 구조상 h2 */
export function SectionLabel({ id, children, className }: { id?: string; children: ReactNode; className?: string }) {
  return (
    <h2 id={id} className={clsx('text-body-s-strong text-secondary', className)}>
      {children}
    </h2>
  )
}

/** 화면 오류(0-6): "불러오지 못했어요" + 「다시 시도」 */
export function InlineError({ onRetry }: { onRetry: () => void }) {
  return (
    <div role="alert" className="flex flex-col items-center gap-4 px-gutter py-16 text-center">
      <p className="text-body-m-strong text-primary">불러오지 못했어요</p>
      <Button type="secondary" size="m" label="다시 시도" onClick={onRetry} />
    </div>
  )
}

const pulse = 'animate-pulse rounded-lg bg-muted motion-reduce:animate-none'

/** 첫 로딩(0-6): 영웅 카드 + 지표 블록 + 행 스켈레톤 */
export function CardsSkeleton({ blocks = 0, rows = 0 }: { blocks?: number; rows?: number }) {
  return (
    <div role="status" aria-label="불러오는 중" aria-busy="true" className="flex flex-col gap-7 px-gutter">
      <div className={clsx(pulse, 'h-32 rounded-xl')} />
      {Array.from({ length: blocks }, (_, i) => (
        <div key={i} className="flex flex-col gap-2.5">
          <div className={clsx(pulse, 'h-4 w-20')} />
          <div className={clsx(pulse, 'h-7 w-40')} />
          <div className={clsx(pulse, 'h-1.5 w-full rounded-full')} />
        </div>
      ))}
      {rows > 0 && (
        <div className="flex flex-col gap-5">
          {Array.from({ length: rows }, (_, i) => (
            <div key={i} className="flex items-center gap-3">
              <div className={clsx(pulse, 'size-9 rounded-full')} />
              <div className="flex flex-1 flex-col gap-2">
                <div className={clsx(pulse, 'h-3.5 w-2/3')} />
                <div className={clsx(pulse, 'h-3 w-1/3')} />
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
