import { clsx } from 'clsx'
import type { ButtonHTMLAttributes, MouseEvent, ReactNode } from 'react'
import { Icon } from '../Icon/Icon'
import type { IconName } from '../Icon/icons'
import { focusRing, touchTarget } from '../styles'

// Figma Button(24:6232) · Type × Size × State(Pressed = :active, Disabled = disabled, Loading = state="loading"(v1.5))
// v1.6.2: Type=Danger-weak = 옅은 에러 면(feedback/error/bg) + 글자·아이콘·스피너 text/error, 테두리 없음.
// 하단 2버튼(BottomCTA Horizontal) 왼쪽의 파괴적 보조 행동(그룹 삭제 등). 크기·라운드는 Secondary와 같다.
export type ButtonType = 'primary' | 'secondary' | 'ghost' | 'danger' | 'danger-weak'
export type ButtonSize = 'l' | 'm' | 's'
/** Figma State 중 prop으로 받는 것. Pressed·Disabled는 CSS·disabled 속성으로 */
export type ButtonState = 'default' | 'loading'

export type ButtonProps = Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'type' | 'children'> & {
  type?: ButtonType
  size?: ButtonSize
  /**
   * Figma State=Loading: 라벨·아이콘은 투명(크기 유지) + 가운데 스피너(라벨 색), `aria-busy`.
   * 누름(클릭·Enter·Space·submit)은 무시하지만 포커스는 그대로 둔다(disabled처럼 포커스가 날아가지 않게).
   */
  state?: ButtonState
  /** Figma Label */
  label: ReactNode
  /** Figma Leading icon */
  leadingIcon?: boolean
  /** Figma Icon(인스턴스 교체). leadingIcon이 켜졌을 때 보인다. */
  icon?: IconName
  /** HTML button type (Figma Type과 이름이 겹쳐 따로 둔다) */
  htmlType?: 'button' | 'submit' | 'reset'
  children?: never
}

const TYPE = {
  primary: 'bg-brand text-inverse disabled:bg-muted',
  secondary: 'border border-strong bg-surface text-primary disabled:border-default disabled:bg-subtle',
  ghost: 'text-brand',
  danger: 'bg-danger text-inverse disabled:bg-muted',
  // Disabled = Secondary Disabled에서 테두리만 뺀 것(bg/subtle + text/disabled)
  'danger-weak': 'bg-feedback-error-bg text-error disabled:bg-subtle',
} satisfies Record<ButtonType, string>

// Pressed. 로딩 중에는 눌림 색을 바꾸지 않는다
const PRESSED = {
  primary: 'enabled:active:bg-brand-pressed',
  secondary: 'enabled:active:bg-pressed',
  ghost: 'enabled:active:bg-brand-subtle',
  danger: 'enabled:active:bg-danger-pressed',
  // Pressed = 글자 error/800. 전용 눌림 면 토큰이 없어(새 토큰 만들지 않음) 면은 5% 어둡게만
  'danger-weak': 'enabled:active:brightness-95 enabled:active:text-error-800',
} satisfies Record<ButtonType, string>

const ICON_COLOR = {
  primary: 'text-icon-inverse',
  secondary: 'text-icon-default',
  ghost: 'text-icon-brand',
  danger: 'text-icon-inverse',
  'danger-weak': 'text-error',
} satisfies Record<ButtonType, string>

const SIZE = {
  l: 'h-14 gap-2 rounded-md px-5 text-label-l',
  m: 'h-12 gap-1.5 rounded-md px-4 text-label-l',
  s: clsx('h-9 gap-1 rounded-sm px-3 text-label-m', touchTarget),
} satisfies Record<ButtonSize, string>

/**
 * Figma spinner(20, S는 16): 트랙(링 25%) + 호(약 55%, 라벨 색). 링 두께 2.2/20.
 * 트랙은 Figma에서 검정 25%라 가장 가까운 토큰 text/primary(neutral-900) 25%를 쓴다.
 */
function Spinner({ size }: { size: 16 | 20 }) {
  const r = 8.9
  const c = 2 * Math.PI * r
  return (
    <svg
      data-spinner=""
      viewBox="0 0 20 20"
      width={size}
      height={size}
      aria-hidden
      focusable="false"
      className="pointer-events-none absolute top-1/2 left-1/2 -translate-1/2 motion-safe:animate-spin"
    >
      <circle cx="10" cy="10" r={r} fill="none" strokeWidth="2.2" className="stroke-text-primary opacity-25" />
      <circle
        cx="10"
        cy="10"
        r={r}
        fill="none"
        strokeWidth="2.2"
        stroke="currentColor"
        strokeDasharray={`${(c * 0.55).toFixed(2)} ${c.toFixed(2)}`}
        transform="rotate(-90 10 10)"
      />
    </svg>
  )
}

export function Button({
  type = 'primary',
  size = 'l',
  state = 'default',
  label,
  leadingIcon = false,
  icon = 'plus',
  htmlType = 'button',
  className,
  onClick,
  ...rest
}: ButtonProps) {
  const loading = state === 'loading'
  const handleClick = (e: MouseEvent<HTMLButtonElement>) => {
    // 로딩 중: 클릭·키보드 누름·폼 제출을 모두 막는다
    if (loading) {
      e.preventDefault()
      return
    }
    onClick?.(e)
  }

  return (
    <button
      type={htmlType}
      aria-busy={loading || undefined}
      aria-disabled={loading || rest['aria-disabled'] || undefined}
      className={clsx(
        'group inline-flex shrink-0 items-center justify-center whitespace-nowrap transition-colors select-none disabled:cursor-not-allowed disabled:text-disabled',
        focusRing,
        TYPE[type],
        loading ? 'relative cursor-progress' : PRESSED[type],
        SIZE[size],
        className,
      )}
      onClick={handleClick}
      {...rest}
    >
      {leadingIcon && (
        <Icon
          name={icon}
          size={size === 's' ? 16 : 20}
          className={clsx('shrink-0 group-disabled:text-icon-disabled', ICON_COLOR[type], loading && 'opacity-0')}
        />
      )}
      {loading ? <span className="opacity-0">{label}</span> : label}
      {loading && <Spinner size={size === 's' ? 16 : 20} />}
    </button>
  )
}
