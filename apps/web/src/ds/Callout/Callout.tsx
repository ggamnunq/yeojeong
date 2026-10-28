import { clsx } from 'clsx'
import type { ButtonHTMLAttributes, ReactNode } from 'react'
import { Icon } from '../Icon/Icon'
import type { IconName } from '../Icon/icons'
import { focusRing } from '../styles'

// Figma Callout(24:12804) · Tone=Pending/Info/Warning/Disconnected × Style=Default/Tone/Inline(v1.4) + Label · Chevron
// 한 줄 배너. Default·Tone은 부모 안에서 가로로 꽉 차고, Inline은 내용 폭(컨트롤 줄용 — Figma에는 Pending만 있다).
// onClick이 있으면 배너 전체가 버튼이다. Pending = 회색 + 주황 점 하나(미확정에서 주황은 이 점뿐).
// 예산 경고에는 쓰지 않는다(BudgetProgress가 맡는다).
export type CalloutTone = 'pending' | 'info' | 'warning' | 'disconnected'
export type CalloutStyle = 'default' | 'tone' | 'inline'

// Figma Style과 이름이 겹쳐 HTML style 속성은 받지 않는다(htmlType과 같은 규칙)
export type CalloutProps = Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'type' | 'style' | 'children'> & {
  tone?: CalloutTone
  /** Figma Style: default = 테두리 · tone = 테두리 없이 면만(r16) · inline = 면·테두리 없음, 내용 폭 */
  style?: CalloutStyle
  /** Figma Label: "확인 필요 2건" · Disconnected "토스 연결 만료" */
  label: ReactNode
  /** Figma Chevron */
  chevron?: boolean
  /** Figma icon 레이어 교체. 기본 Info = info, Warning = alert, Disconnected = link (Pending은 점) */
  icon?: IconName
  /** Figma action(Disconnected): 기본 "다시 연결" */
  action?: ReactNode
  htmlType?: 'button' | 'submit' | 'reset'
  children?: never
}

const TONE = {
  pending: { border: 'border-expense-pending-border', bg: 'bg-canvas', icon: null, iconColor: 'text-expense-pending-fg' },
  info: { border: 'border-feedback-info-border', bg: 'bg-feedback-info-bg', icon: 'info', iconColor: 'text-feedback-info-fg' },
  warning: {
    border: 'border-feedback-warning-border',
    bg: 'bg-feedback-warning-bg',
    icon: 'alert',
    iconColor: 'text-feedback-warning-fg',
  },
  disconnected: {
    border: 'border-feedback-error-border',
    bg: 'bg-feedback-error-bg',
    icon: 'link',
    iconColor: 'text-feedback-error-fg',
  },
} satisfies Record<CalloutTone, { border: string; bg: string; icon: IconName | null; iconColor: string }>

export function Callout({
  tone = 'pending',
  style = 'default',
  label,
  chevron = true,
  icon,
  action,
  htmlType = 'button',
  className,
  onClick,
  ...rest
}: CalloutProps) {
  const t = TONE[tone]
  const iconName = icon ?? t.icon
  const inline = style === 'inline'
  const base = clsx(
    'items-center py-3.5 text-left',
    inline ? 'inline-flex gap-1.5 rounded-md' : 'flex w-full gap-2 pr-3.5 pl-4',
    style === 'default' && ['rounded-md border', t.border, t.bg],
    style === 'tone' && ['rounded-lg', t.bg],
    className,
  )

  const content = (
    <>
      {iconName ? (
        <Icon name={iconName} size={20} className={clsx('shrink-0', t.iconColor)} />
      ) : (
        <span aria-hidden className="size-2 shrink-0 rounded-full bg-expense-pending-dot" />
      )}
      <span className={clsx('text-body-m-strong text-primary', !inline && 'min-w-0 flex-1')}>{label}</span>
      {tone === 'disconnected' && <span className="shrink-0 text-label-m text-brand">{action ?? '다시 연결'}</span>}
      {chevron && <Icon name="chevron-right" size={20} className="shrink-0 text-icon-subtle" />}
    </>
  )

  if (!onClick) return <div className={base}>{content}</div>

  return (
    <button
      type={htmlType}
      onClick={onClick}
      className={clsx(base, 'transition-[filter] select-none active:brightness-95', focusRing)}
      {...rest}
    >
      {content}
    </button>
  )
}
