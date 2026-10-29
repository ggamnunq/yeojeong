import { formatKrw, InputAmount } from '../../ds'
import { FIELD_COPY } from './form'
import { currencySymbol, isPositiveAmount, overKrwLimit, toggleCurrency } from './rules'

// 수동 결제 시트(WF-46 · 48 · 50)가 같이 쓰는 조각. 폼 행 자체는 DS(RowField · RowFieldInput · RowFieldToggle)를 그대로 쓴다.

export type AmountFieldProps = {
  value: string
  onChange: (raw: string) => void
  currency: string
  /** 고를 수 있는 통화(KRW · 대상 여정 통화). 하나면 칩을 누를 수 없다 */
  allowed: readonly string[]
  onCurrencyChange: (currency: string) => void
  digits: number
  /** 원화 환산(외화 미리보기 · 상한 판정). 모르면 null */
  krw: number | null
  disabled?: boolean
  /** 서버 400 amount 문구 */
  serverError?: string | null
  autoFocus?: boolean
}

/** 큰 금액 + 통화 칩 + "≈ ₩11,030" + 상한 초과 에러 한 줄(FR-427) */
export function AmountField({
  value,
  onChange,
  currency,
  allowed,
  onCurrencyChange,
  digits,
  krw,
  disabled,
  serverError,
  autoFocus,
}: AmountFieldProps) {
  const over = overKrwLimit(krw)
  const error = over ? FIELD_COPY.overLimit : (serverError ?? null)
  const switchable = allowed.length > 1 && !disabled
  return (
    <div className="flex flex-col gap-1 pb-4">
      <InputAmount
        value={value}
        onChange={onChange}
        symbol={currencySymbol(currency)}
        fractionDigits={digits}
        disabled={disabled}
        autoFocus={autoFocus}
        aria-invalid={error ? true : undefined}
        currency={{
          label: currency,
          onClick: switchable ? () => onCurrencyChange(toggleCurrency(currency, allowed)) : undefined,
          disabled,
        }}
        converted={currency !== 'KRW' && krw !== null && isPositiveAmount(value) ? `≈ ${formatKrw(krw)}` : undefined}
      />
      {error && (
        <p role="alert" className="text-caption text-error">
          {error}
        </p>
      )}
    </div>
  )
}
