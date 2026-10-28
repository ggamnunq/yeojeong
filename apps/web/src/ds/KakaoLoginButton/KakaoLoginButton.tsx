import { clsx } from 'clsx'
import type { ButtonHTMLAttributes, ReactNode } from 'react'
import { KakaoSymbol } from '../Icon/KakaoSymbol'
import { focusRing } from '../styles'

// Figma KakaoLoginButton(24:6419) · Size × State(Pressed = :active)
// 색은 카카오 로그인 디자인 가이드 고정값(#FEE500, 라벨 #000 85%, 눌림 #EDD500)이라 토큰을 쓰지 않는다.
export type KakaoLoginButtonSize = 'l' | 'm'

export type KakaoLoginButtonProps = Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'type' | 'children'> & {
  size?: KakaoLoginButtonSize
  /** Figma Label */
  label?: ReactNode
  htmlType?: 'button' | 'submit' | 'reset'
  children?: never
}

const SIZE = {
  l: 'h-14 text-body-l-strong',
  m: 'h-12 text-body-m-strong',
} satisfies Record<KakaoLoginButtonSize, string>

export function KakaoLoginButton({
  size = 'l',
  label = '카카오 로그인',
  htmlType = 'button',
  className,
  ...rest
}: KakaoLoginButtonProps) {
  return (
    <button
      type={htmlType}
      className={clsx(
        'flex w-full items-center justify-center gap-2 rounded-md bg-[#FEE500] text-[rgb(0_0_0/0.85)] transition-colors select-none enabled:active:bg-[#EDD500] disabled:cursor-not-allowed',
        focusRing,
        SIZE[size],
        className,
      )}
      {...rest}
    >
      <KakaoSymbol size={size === 'l' ? 24 : 20} className="shrink-0" />
      {label}
    </button>
  )
}
