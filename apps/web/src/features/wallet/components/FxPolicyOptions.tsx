import { clsx } from 'clsx'
import { useId } from 'react'
import type { FxPolicy } from '../../../api'
import { Icon } from '../../../ds'

// HF-29 적용 환율 목록: ListItem Selected 모양(제목 + 선택 체크)의 라디오 행. 진짜 라디오라 화살표 키로 고른다.
// TODO(DS 추가 요청): Figma는 ListItem Type=Selected를 라디오처럼 쓰는데 DS ListItem은 버튼이라 여기서 조립했다(Row/Radio 후보).

export const FX_POLICY_LABEL = {
  SPOT_AT_PAYMENT: '결제 시점 매매기준율',
  CARD_BILLED: '카드사 청구 환율',
  FIXED: '고정 환율 직접 입력',
} satisfies Record<FxPolicy, string>

const ORDER: readonly FxPolicy[] = ['SPOT_AT_PAYMENT', 'CARD_BILLED', 'FIXED']

export type FxPolicyOptionsProps = {
  value: FxPolicy
  onChange: (policy: FxPolicy) => void
  /** 그룹장이 아니거나 종료 후 */
  disabled: boolean
  'aria-labelledby'?: string
}

export function FxPolicyOptions({ value, onChange, disabled, 'aria-labelledby': labelledBy }: FxPolicyOptionsProps) {
  const name = useId()
  return (
    <div role="radiogroup" aria-labelledby={labelledBy} aria-disabled={disabled || undefined} className="flex flex-col">
      {ORDER.map((policy) => {
        const checked = value === policy
        return (
          <label
            key={policy}
            className={clsx(
              'flex min-h-14 items-center gap-3 bg-surface px-5 py-3.5 transition-colors select-none has-[:focus-visible]:shadow-focus-ring',
              disabled ? 'cursor-default' : 'cursor-pointer active:bg-pressed',
            )}
          >
            <input
              type="radio"
              name={name}
              value={policy}
              checked={checked}
              disabled={disabled}
              onChange={() => onChange(policy)}
              className="sr-only"
            />
            <span
              className={clsx(
                'min-w-0 flex-1 truncate',
                checked ? 'text-body-m-strong text-primary' : clsx('text-body-m', disabled ? 'text-disabled' : 'text-primary'),
              )}
            >
              {FX_POLICY_LABEL[policy]}
            </span>
            {checked && <Icon name="check" size={20} className="shrink-0 text-icon-brand" />}
          </label>
        )
      })}
    </div>
  )
}
