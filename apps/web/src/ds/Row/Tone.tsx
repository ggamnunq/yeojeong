import { clsx } from 'clsx'
import type { HTMLAttributes, ReactNode } from 'react'
import { Button, type ButtonProps } from '../Button/Button'

// Figma Row/Tone(52:10240, v1.5) · Label · Value(TEXT) + Action(BOOLEAN). 톤 행(HF-16 초대코드, 토스 연결 상태).
// bg/subtle · radius 16 · 패딩 16/16/16/20: 라벨(Caption text/tertiary) + 값(IBM Plex Sans KR 20 SemiBold, 자간 2) · 오른쪽 Button Secondary S. 높이 78.

/** Figma Action: Button Secondary S(라벨 · 앞 아이콘은 중첩 인스턴스). icon을 주면 앞 아이콘이 켜진다 */
export type RowToneAction = Pick<ButtonProps, 'label' | 'onClick' | 'icon' | 'disabled' | 'state' | 'aria-label'>

export type RowToneProps = Omit<HTMLAttributes<HTMLDivElement>, 'children'> & {
  /** Figma Label: "초대코드" */
  label: ReactNode
  /** Figma Value: "K7M-2QX" */
  value: ReactNode
  /** Figma Action: { label: '복사', icon: 'copy', 'aria-label': '초대코드 복사', onClick } */
  action?: RowToneAction
  /** Action 왼쪽에 나란히 둘 버튼(간격 8) — 초대코드 「QR 코드」(W8). 같은 크기(Button S)·톤(Secondary)으로 맞춘다 */
  accessory?: ReactNode
  children?: never
}

export function RowTone({ label, value, action, accessory, className, ...rest }: RowToneProps) {
  return (
    <div className={clsx('flex w-full items-center justify-between gap-3 rounded-lg bg-subtle py-4 pr-4 pl-5', className)} {...rest}>
      <p className="flex min-w-0 flex-col gap-0.5">
        <span className="text-caption text-tertiary">{label}</span>
        {/* Figma 값 = Amount/M 서체 · 크기에 자간만 2(텍스트 스타일 없음) */}
        <span className="truncate font-amount text-amount-m tracking-[2px] text-amount-default">{value}</span>
      </p>
      {accessory != null ? (
        <div className="flex shrink-0 items-center gap-2">
          {accessory}
          {action && <Button type="secondary" size="s" leadingIcon={action.icon != null} {...action} />}
        </div>
      ) : (
        action && <Button type="secondary" size="s" leadingIcon={action.icon != null} {...action} />
      )}
    </div>
  )
}
