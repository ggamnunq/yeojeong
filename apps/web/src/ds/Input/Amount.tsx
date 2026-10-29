import { clsx } from 'clsx'
import { useLayoutEffect, useRef, type InputHTMLAttributes, type MouseEventHandler, type ReactNode, type Ref } from 'react'
import { focusRing, touchTarget } from '../styles'
import { amountCaretPosition, amountCharsBefore, amountInputOverflows, amountInputSize, formatAmountInput, normalizeAmountInput } from './rules'

// Input Type=Amount(DS18 · Figma Form/ManualPayment 77:10549의 amount 부분 · 화면명세 B-24).
// 수동 결제 시트 맨 위 큰 금액: 기호 + 숫자(Amount/XL 40/48, IBM Plex Sans KR, 캐럿 bg/brand) … 오른쪽 통화 칩(Chip Tone 모양, h36)
// → 아래 환산 한 줄 "≈ ₩11,030"(Caption text/tertiary, 간격 2). 빈 값은 placeholder "0" + 기호까지 text/disabled.
// 상태는 원값(raw: "1200" · "12.5")으로 쥐고 화면에는 쉼표를 넣어 보인다. 소수 자리는 fractionDigits(통화 규칙).

export type InputAmountCurrency = {
  /** 칩 글자: "JPY" · "KRW"(Figma는 통화 코드) */
  label: ReactNode
  /** 누르면 KRW ↔ 여정 통화. 없으면 누를 수 없는 칩(KRW 여정 · 바꿀 수 없는 경우) */
  onClick?: MouseEventHandler<HTMLButtonElement>
  disabled?: boolean
  /** 접근성 이름. 기본 "통화 바꾸기, 지금 {label}" (label이 글자일 때) */
  'aria-label'?: string
}

export type InputAmountProps = Omit<
  InputHTMLAttributes<HTMLInputElement>,
  'type' | 'value' | 'defaultValue' | 'onChange' | 'children' | 'size' | 'inputMode'
> & {
  /** 원값: "" · "1200" · "12.5" */
  value: string
  /** 새 원값(쉼표 없음, 소수 자리 잘림) */
  onChange?: (raw: string) => void
  /** 숫자 앞 통화 기호: "¥" · "₩" · "$" */
  symbol: string
  /** 소수 자리(통화 규칙). 기본 0(KRW·JPY) */
  fractionDigits?: number
  /** 오른쪽 통화 칩. 없으면 그리지 않는다 */
  currency?: InputAmountCurrency
  /** 환산 한 줄 "≈ ₩11,030". KRW 입력·환율 없음이면 넘기지 않는다 */
  converted?: ReactNode
  /** 입력의 접근성 이름. 기본 "금액" */
  label?: string
  /** 바깥 래퍼 className */
  className?: string
  /** 입력 요소 ref(시트 initialFocus 등) */
  ref?: Ref<HTMLInputElement>
  children?: never
}

export function InputAmount({
  value,
  onChange,
  symbol,
  fractionDigits = 0,
  currency,
  converted,
  label = '금액',
  placeholder = '0',
  disabled,
  className,
  ref,
  ...rest
}: InputAmountProps) {
  const inputRef = useRef<HTMLInputElement>(null)
  const setRef = (el: HTMLInputElement | null) => {
    inputRef.current = el
    if (typeof ref === 'function') return ref(el)
    if (ref) ref.current = el
  }
  const caret = useRef<number | null>(null)
  const display = formatAmountInput(value)
  const empty = display === ''

  // 쉼표를 다시 넣은 뒤 캐럿을 같은 숫자 뒤로 되돌린다
  useLayoutEffect(() => {
    const input = inputRef.current
    if (caret.current === null || !input || document.activeElement !== input) return
    const position = amountCaretPosition(display, caret.current)
    caret.current = null
    input.setSelectionRange(position, position)
  }, [display])

  const currencyName =
    currency?.['aria-label'] ??
    (typeof currency?.label === 'string' ? `통화 바꾸기, 지금 ${currency.label}` : undefined)
  const chipClass = 'inline-flex h-9 shrink-0 items-center rounded-full bg-subtle px-3.5 text-label-m text-secondary'

  return (
    <div className={clsx('flex flex-col gap-0.5', className)}>
      <div className="flex items-center gap-2">
        <label
          className={clsx(
            'flex min-w-0 flex-1 items-center overflow-hidden font-amount',
            amountInputSize(display),
            disabled ? 'cursor-not-allowed text-disabled' : 'cursor-text',
            !disabled && (empty ? 'text-disabled' : 'text-primary'),
          )}
        >
          <span aria-hidden className="shrink-0">
            {symbol}
          </span>
          {/* 입력 폭을 글자에 맞추는 겹친 그리드: 보이지 않는 글자가 폭을 정하고 입력이 그 위에 겹친다(캐럿이 숫자 바로 뒤) */}
          <span className="inline-grid min-w-0">
            <span aria-hidden className="invisible col-start-1 row-start-1 pr-0.5 whitespace-pre">
              {empty ? placeholder : display}
            </span>
            <input
              ref={setRef}
              type="text"
              inputMode={fractionDigits > 0 ? 'decimal' : 'numeric'}
              autoComplete="off"
              aria-label={label}
              value={display}
              placeholder={placeholder}
              disabled={disabled}
              onChange={(event) => {
                const input = event.currentTarget
                if (amountInputOverflows(input.value, value, fractionDigits)) {
                  // 이미 찬 자리에 더 친 입력은 무시한다: 값을 되돌리고 캐럿은 친 글자 앞자리에 둔다
                  const at = Math.max(0, (input.selectionStart ?? input.value.length) - (input.value.length - display.length))
                  input.value = display
                  input.setSelectionRange(at, at)
                  return
                }
                caret.current = amountCharsBefore(input.value, input.selectionStart ?? input.value.length)
                onChange?.(normalizeAmountInput(input.value, fractionDigits))
              }}
              className="col-start-1 row-start-1 w-full min-w-0 bg-transparent p-0 caret-bg-brand outline-hidden placeholder:text-disabled disabled:cursor-not-allowed"
              {...rest}
            />
          </span>
        </label>
        {currency &&
          (currency.onClick ? (
            <button
              type="button"
              onClick={currency.onClick}
              disabled={disabled || currency.disabled}
              aria-label={currencyName}
              className={clsx(
                chipClass,
                'transition-colors select-none enabled:active:bg-pressed disabled:cursor-not-allowed disabled:text-disabled',
                focusRing,
                touchTarget,
              )}
            >
              {currency.label}
            </button>
          ) : (
            <span className={clsx(chipClass, (disabled || currency.disabled) && 'text-disabled')}>{currency.label}</span>
          ))}
      </div>
      {converted != null && <p className="text-caption text-tertiary">{converted}</p>}
    </div>
  )
}
