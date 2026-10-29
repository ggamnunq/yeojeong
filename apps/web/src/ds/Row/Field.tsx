import { clsx } from 'clsx'
import { useId, type ButtonHTMLAttributes, type InputHTMLAttributes, type ReactNode } from 'react'
import { Avatar } from '../Avatar/Avatar'
import type { AvatarPerson } from '../Avatar/rules'
import { AvatarStack } from '../AvatarStack/AvatarStack'
import { avatarStackLabel } from '../AvatarStack/rules'
import { Icon } from '../Icon/Icon'
import { focusRing } from '../styles'
import { Tag } from '../Tag/Tag'
import { Toggle, type ToggleProps } from '../Toggle/Toggle'

// Figma Row/Field(77:10504 · v1.6.3에서 06 로컬 → DS 이동, ID 유지) · Label · Value · Avatar · Stack · Personal · Value visible · Chevron.
// 수동 결제 폼 행(350 × 52, 거터 안): 라벨(Body/M text/secondary) … 값(프사 XS · 스택 XS · 자물쇠 개인 · 글자 Body/M text/primary, 간격 6) · ›16 icon/subtle.
// 행 사이 선 없음. 내용 · 결제자 · 나누기 · 날짜 · 여정(HF-46 · 48 · 50). 탭하면 시트 안 단계(WF-47 · 48b)나 날짜 시트를 연다.
// 같은 모양의 변형 둘: RowFieldInput(값 자리가 인라인 텍스트 입력 — "내용", › 없음) · RowFieldToggle(라벨 text/primary + Toggle — "내 지갑에도 기록").

const ROW = 'flex h-13 w-full items-center gap-1 text-left'

export type RowFieldProps = Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'type' | 'value' | 'children'> & {
  /** Figma Label: "결제자" · "나누기" · "날짜" · "여정" */
  label: ReactNode
  /** Figma Value(글자): "나" · "지금" · "11.13 15:20" · "오사카 3박 4일"(길면 말줄임) */
  value?: ReactNode
  /** 값이 없을 때 흐린 글자(text/tertiary): "추가 안 함" · "선택" */
  placeholder?: ReactNode
  /** Figma Avatar: 값 앞 프사 XS(20) — 결제자 */
  avatar?: AvatarPerson
  /** Figma Stack: 값 자리 프사 스택 XS(나 먼저 → 가입 순, 최대 4 + "+N"). "공동 4명" 같은 글자는 쓰지 않는다 */
  stack?: readonly AvatarPerson[]
  /** Figma Personal: 자물쇠 "개인" 태그(Tag Personal S) — 나누기 = 나만 */
  personal?: boolean
  /** Figma Chevron: 오른쪽 ›16. 기본 true */
  chevron?: boolean
  htmlType?: 'button' | 'submit' | 'reset'
  children?: never
}

/** 라벨 … 값 › 행. 진짜 버튼이고 접근성 이름은 "라벨 + 값"(스택은 "나, 민지 외 2명")이다. disabled면 흐리게 + 누름 없음 */
export function RowField({
  label,
  value,
  placeholder,
  avatar,
  stack,
  personal = false,
  chevron = true,
  htmlType = 'button',
  disabled,
  className,
  ...rest
}: RowFieldProps) {
  const hasValue = value != null && value !== false && value !== ''
  return (
    <button
      type={htmlType}
      disabled={disabled}
      className={clsx(ROW, 'group rounded-sm select-none disabled:cursor-not-allowed', focusRing, className)}
      {...rest}
    >
      <span className="shrink-0 text-body-m text-secondary group-disabled:text-disabled">{label}</span>
      {/* flex 안 공백 글자는 그려지지 않고 접근성 이름에서 "라벨 값"을 띄운다 */}{' '}
      <span className="flex min-w-0 flex-1 items-center justify-end gap-1.5 overflow-hidden group-disabled:opacity-40">
        {avatar && <Avatar {...avatar} size="xs" alt="" />}
        {stack && stack.length > 0 && <AvatarStack people={stack} size="xs" label={avatarStackLabel(stack)} />}{' '}
        {personal && <Tag type="personal" size="s" />}{' '}
        {hasValue ? (
          <span className="min-w-0 truncate text-body-m text-primary">{value}</span>
        ) : (
          placeholder != null && <span className="min-w-0 truncate text-body-m text-tertiary">{placeholder}</span>
        )}
      </span>
      {chevron && <Icon name="chevron-right" size={16} className="shrink-0 text-icon-subtle group-disabled:text-icon-disabled" />}
    </button>
  )
}

export type RowFieldInputProps = Omit<InputHTMLAttributes<HTMLInputElement>, 'type' | 'children' | 'size'> & {
  /** Figma Label: "내용" */
  label: ReactNode
  /** 입력 종류. 기본 text */
  htmlType?: 'text' | 'search'
  children?: never
}

/**
 * Value=Input: 라벨 … 오른쪽 정렬 인라인 텍스트 입력(Body/M, placeholder text/tertiary, › 없음).
 * 라벨이 입력의 이름이다. 글자 수 제한(40자)은 maxLength로 넘긴다. 박스가 없어 포커스는 캐럿(bg/brand)으로 보인다.
 */
export function RowFieldInput({ label, htmlType = 'text', disabled, className, id, ...rest }: RowFieldInputProps) {
  const autoId = useId()
  const inputId = id ?? autoId
  return (
    <div className={clsx(ROW, 'gap-3', className)}>
      <label htmlFor={inputId} className={clsx('shrink-0 text-body-m', disabled ? 'text-disabled' : 'text-secondary')}>
        {label}
      </label>
      <input
        id={inputId}
        type={htmlType}
        disabled={disabled}
        className="h-full min-w-0 flex-1 bg-transparent text-right text-body-m text-primary caret-bg-brand outline-hidden placeholder:text-tertiary disabled:cursor-not-allowed disabled:text-disabled"
        {...rest}
      />
    </div>
  )
}

export type RowFieldToggleProps = Omit<ToggleProps, 'aria-label' | 'aria-labelledby'> & {
  /** 라벨(Body/M text/primary): "내 지갑에도 기록" */
  label: ReactNode
}

/** 토글 행(Figma row · 지갑): 라벨 … Toggle(48 × 28), 간격 8. 라벨이 스위치 이름이고 라벨을 눌러도 바뀐다 */
export function RowFieldToggle({ label, className, disabled, id, ...toggle }: RowFieldToggleProps) {
  const labelId = useId()
  const autoId = useId()
  const toggleId = id ?? autoId
  return (
    <div className={clsx(ROW, 'gap-2', className)}>
      {/* 버튼도 <label for>로 이어지는 요소라 라벨을 누르면 스위치가 눌린다 */}
      <label
        id={labelId}
        htmlFor={toggleId}
        className={clsx('min-w-0 flex-1 text-body-m select-none', disabled ? 'text-disabled' : 'cursor-pointer text-primary')}
      >
        {label}
      </label>
      <Toggle id={toggleId} aria-labelledby={labelId} disabled={disabled} {...toggle} />
    </div>
  )
}
