import { clsx } from 'clsx'
import { useMemo } from 'react'
import { qrMatrix, qrPath } from '../qr'

export type InviteQrProps = {
  /** QR에 담을 글자(참여 링크 https://…/join?code=…) */
  value: string
  /** QR 그림 한 변(px, 타일 패딩·테두리 제외). 기본 200 */
  size?: number
  /** 스크린리더 이름 */
  label: string
  className?: string
}

/**
 * 초대 QR 타일(W8 · HF-61, Figma SheetContent/InviteQR 「qr tile」 234 + Code/QR 200). 클라이언트에서 만들어 인라인 SVG로 그린다
 * (이미지 요청·data URI 없음 — CSP 그대로). 흰 바탕 고정 + 연회색 실선 테두리(1) + 패딩 16, 로고 없음, 오류 정정 M.
 * 다크 모듈은 neutral-900(인쇄 검정에 가까운 색).
 */
export function InviteQr({ value, size = 200, label, className }: InviteQrProps) {
  const { d, n } = useMemo(() => {
    const matrix = qrMatrix(value)
    return { d: qrPath(matrix), n: matrix.length }
  }, [value])
  return (
    <div className={clsx('shrink-0 rounded-lg border border-default bg-neutral-0 p-4', className)}>
      <svg
        role="img"
        aria-label={label}
        viewBox={`0 0 ${n} ${n}`}
        width={size}
        height={size}
        shapeRendering="crispEdges"
        className="block text-neutral-900"
      >
        <path d={d} fill="currentColor" />
      </svg>
    </div>
  )
}
