import { clsx } from 'clsx'
import type { InputHTMLAttributes, ReactNode, Ref } from 'react'
import { CheckboxBox } from '../Checkbox/Checkbox'
import { Tag } from '../Tag/Tag'

// Figma Row/Pick(세트 115:15176, v1.7) · State=Default(115:15113)/Selected(115:15136, checked)/Disabled(115:15155, disabled)
// + Title · Meta text · Amount · Sub text(TEXT) · Meta(on) · Sub amount(on) · Chip(off)(BOOLEAN).
// 체크 선택 행 390 × 68(전폭, 자체 좌우 20 · 위아래 13 · 간격 14): Checkbox 상자 + 제목(Body/M Strong) / 메타 줄(Caption text/tertiary + chip = Tag Pending S, 간격 6)
// + 금액(Amount/S) / 보조 금액(Caption text/tertiary). 금액 색: Default text/secondary · Selected amount/default · Disabled text/tertiary(제목도 tertiary, 상자 Disabled).
// 기간 외 결제 추가(HF-43)와 카드 내역 불러오기(HF-56 · 56s · 56c)에서 같이 쓴다. 행 전체가 체크박스 라벨(누르는 영역)이다.
export type RowPickProps = Omit<
  InputHTMLAttributes<HTMLInputElement>,
  'type' | 'title' | 'children' | 'checked' | 'defaultChecked' | 'className'
> & {
  /** Figma Title: 가맹점 */
  title: ReactNode
  /** Figma Meta + Meta text: "15:40 · 오사카 3박 4일" · "11.13". 없으면 Meta off */
  meta?: ReactNode
  /** Figma Amount: "₩110,300" */
  amount: ReactNode
  /** Figma Sub amount + Sub text: 원통화 · 부분 취소 등 보조 금액("¥12,000"). 없으면 Sub amount off */
  subAmount?: ReactNode
  /** Figma Chip + chip Label: 메타 줄 끝 회색 칩(Tag Pending S) — "추가됨" · "취소됨" · "비슷한 기록". 없으면 Chip off */
  chip?: ReactNode
  /** Figma State=Selected */
  checked: boolean
  /** Figma State=Disabled: 이미 추가·취소 등 고를 수 없음 */
  disabled?: boolean
  ref?: Ref<HTMLInputElement>
  className?: string
}

export function RowPick({ title, meta, amount, subAmount, chip, checked, disabled = false, className, ...rest }: RowPickProps) {
  return (
    <label
      className={clsx(
        'flex min-h-17 w-full items-center gap-3.5 px-5 py-3.25 select-none',
        disabled ? 'cursor-not-allowed' : 'cursor-pointer',
        className,
      )}
    >
      <CheckboxBox checked={checked} disabled={disabled} {...rest} />
      <span className="flex min-w-0 flex-1 flex-col gap-0.5">
        <span className={clsx('truncate text-body-m-strong', disabled ? 'text-tertiary' : 'text-primary')}>{title}</span>
        {(meta != null || chip != null) && (
          <span className="flex h-4.5 min-w-0 items-center gap-1.5">
            {meta != null && <span className="truncate text-caption text-tertiary">{meta}</span>}
            {chip != null && <Tag type="pending" size="s" label={chip} />}
          </span>
        )}
      </span>
      <span className="flex shrink-0 flex-col items-end gap-0.5 text-right whitespace-nowrap">
        <span
          className={clsx(
            'font-amount text-amount-s',
            disabled ? 'text-tertiary' : checked ? 'text-amount-default' : 'text-secondary',
          )}
        >
          {amount}
        </span>
        {subAmount != null && <span className="text-caption text-tertiary">{subAmount}</span>}
      </span>
    </label>
  )
}
