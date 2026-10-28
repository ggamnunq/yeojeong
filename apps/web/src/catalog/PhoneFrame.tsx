import { clsx } from 'clsx'
import type { ReactNode } from 'react'

// 390×844 화면 틀. 안쪽이 스크롤 컨테이너라 Screen의 sticky 헤더·하단이 틀 안에 붙고,
// transform 덕분에 fixed(토스트 자리 등)도 틀 기준으로 잡힌다. overlay는 스크롤과 상관없이 틀 위에 겹친다.
export function PhoneFrame({
  children,
  overlay,
  height = 844,
  className,
}: {
  children: ReactNode
  overlay?: ReactNode
  height?: 844 | 640 | 480
  className?: string
}) {
  return (
    <div
      className={clsx(
        // 테두리는 outline으로 그려 안쪽 폭을 정확히 390으로 둔다
        'relative w-[390px] shrink-0 transform-gpu overflow-hidden rounded-xl bg-canvas outline outline-border-default',
        { 844: 'h-[844px]', 640: 'h-[640px]', 480: 'h-[480px]' }[height],
        className,
      )}
    >
      <div className="h-full overflow-y-auto [--screen-min-height:100%]">{children}</div>
      {/* Screen의 sticky 헤더·하단(z-10)보다 위. 실제 시트·다이얼로그는 최상위 레이어라 이 틀이 필요 없다. */}
      {overlay && <div className="absolute inset-0 z-30">{overlay}</div>}
    </div>
  )
}
