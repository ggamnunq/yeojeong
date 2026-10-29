import { clsx } from 'clsx'
import { Button } from '../../../ds'

export type InviteQrButtonProps = {
  /** 옆 「복사」 버튼과 같은 크기: HF-11 = M(48), 초대코드 행(HF-16·23) = S(36) */
  size: 'm' | 's'
  onClick: () => void
  className?: string
}

/** 초대코드 「복사」 왼쪽 QR 아이콘 버튼(W8 · HF-11 48×48, HF-16·23 36×36). 복사 버튼과 같은 높이·톤(Button Secondary)의 정사각, 라벨 없이 이름 "초대 QR" */
export function InviteQrButton({ size, onClick, className }: InviteQrButtonProps) {
  return (
    <Button
      type="secondary"
      size={size}
      leadingIcon
      icon="qr-code"
      label={<span className="sr-only">초대 QR</span>}
      aria-haspopup="dialog"
      className={clsx(size === 'm' ? 'w-12 px-0' : 'w-9 px-0', className)}
      onClick={onClick}
    />
  )
}
