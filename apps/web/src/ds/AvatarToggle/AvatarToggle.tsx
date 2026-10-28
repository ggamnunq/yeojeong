import { clsx } from 'clsx'
import { useState, type ButtonHTMLAttributes, type ReactNode } from 'react'
import { Avatar } from '../Avatar/Avatar'
import type { AvatarPerson } from '../Avatar/rules'
import { Icon } from '../Icon/Icon'
import { focusRing } from '../styles'

// Figma AvatarToggle(24:17006) · Selected=On/Off × State=Default/Disabled(v1.4, = disabled 속성)
// 부담 인원 고르기(복수 선택) — aria-pressed 토글 버튼. 개인 결제처럼 고를 수 없을 때 disabled.
export type AvatarToggleProps = Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'type' | 'onChange' | 'children' | 'name'> & {
  /** 프사(Avatar L)와 이름 */
  person: AvatarPerson
  /** Figma Name. 기본은 나면 "나", 아니면 person.name */
  name?: ReactNode
  selected?: boolean
  defaultSelected?: boolean
  onChange?: (selected: boolean) => void
  children?: never
}

export function AvatarToggle({
  person,
  name,
  selected,
  defaultSelected = false,
  onChange,
  onClick,
  className,
  ...rest
}: AvatarToggleProps) {
  const [inner, setInner] = useState(defaultSelected)
  const on = selected ?? inner

  return (
    <button
      type="button"
      aria-pressed={on}
      onClick={(event) => {
        onClick?.(event)
        if (event.defaultPrevented) return
        if (selected === undefined) setInner(!on)
        onChange?.(!on)
      }}
      className={clsx(
        'group inline-flex w-14 shrink-0 flex-col items-center gap-1.5 rounded-md select-none disabled:cursor-not-allowed',
        focusRing,
        className,
      )}
      {...rest}
    >
      <span className="relative size-12">
        {/* 이름이 아래에 보이므로 프사는 장식. On 100% → Off 40%, 비활성 On 40% · Off 25% */}
        <Avatar
          {...person}
          size="l"
          alt=""
          className={clsx('transition-opacity', on ? 'group-disabled:opacity-40' : 'opacity-40 group-disabled:opacity-25')}
        />
        {on && (
          <span className="absolute top-7.75 left-7.75 grid size-5 place-items-center rounded-full bg-brand ring-2 ring-bg-surface group-disabled:bg-neutral-300">
            <Icon name="check" size={14} className="text-icon-inverse" />
          </span>
        )}
      </span>
      <span
        className={clsx('max-w-full truncate text-label-s group-disabled:text-disabled', on ? 'text-primary' : 'text-tertiary')}
      >
        {name ?? (person.me ? '나' : person.name)}
      </span>
    </button>
  )
}
