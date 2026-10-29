import { clsx } from 'clsx'
import type { ReactNode } from 'react'
import { Button, type ButtonProps } from '../Button/Button'
import { Checkbox } from '../Checkbox/Checkbox'
import { RowConsent, type RowConsentChevron } from '../Row/Consent'
import { consentAllChecked, consentRequiredDone } from './rules'

// Figma SheetContent/Consent(52:10122, v1.5) · Row 4(BOOLEAN) · CTA(BOOLEAN). BottomSheet Content용 동의 내용(HF-05b).
// 전체 동의 톤 행(bg/subtle r16 · 20/16, Checkbox + Body/L Strong) → 12 → Row/Consent × n(사이 4) → 24 → CTA(Button Primary L FILL).
// 시트 제목 "금융정보 연동 동의", 시트의 cta는 끄고 이 cta를 쓴다. 체크 상태는 부모가 쥔다(controlled):
// 전체 동의 = 모든 행이 체크됐는가, CTA = 필수 행이 모두 체크됐을 때만 활성.
export type SheetContentConsentItem = {
  /** 동의 문서 ID(onToggle로 돌려준다) */
  id: string
  /** 문서 제목 — "[필수]"/"[선택]"은 required로 붙는다 */
  title: ReactNode
  /** 기본 true("[필수]") */
  required?: boolean
  checked: boolean
  /** 오른쪽 ›(약관 전문) */
  chevron?: RowConsentChevron
}

export type SheetContentConsentCta = Pick<ButtonProps, 'label' | 'onClick' | 'disabled' | 'state' | 'htmlType' | 'form'>

export type SheetContentConsentProps = {
  /** Figma consent 1~4(Row 4 = 4번째 [선택] 행). 서버 순서 그대로 */
  items: readonly SheetContentConsentItem[]
  /** 행 하나를 바꿀 때 */
  onToggle: (id: string, next: boolean) => void
  /** 전체 동의를 바꿀 때(next = 모두 체크 / 모두 해제) */
  onToggleAll: (next: boolean) => void
  /** 전체 동의 행 문구. 기본 "전체 동의" */
  allLabel?: ReactNode
  /**
   * Figma CTA: 객체를 주면 아래에 Button Primary L. 필수 행이 모두 체크되기 전에는 비활성(cta.disabled로 더 막을 수 있다).
   * 처리 중이면 `state: 'loading'`.
   */
  cta?: SheetContentConsentCta
  /** 문서 목록을 받는 중: 행 자리에 스켈레톤 3개, 전체 동의·CTA 비활성 */
  loading?: boolean
  className?: string
}

const SKELETON_ROWS = 3

export function SheetContentConsent({
  items,
  onToggle,
  onToggleAll,
  allLabel = '전체 동의',
  cta,
  loading = false,
  className,
}: SheetContentConsentProps) {
  const all = consentAllChecked(items)
  const requiredDone = consentRequiredDone(items)

  return (
    <div className={clsx('flex w-full flex-col bg-surface', className)}>
      <div className="rounded-lg bg-subtle px-5 py-4">
        <Checkbox
          className="w-full"
          // Figma: 상자와 문구 사이 12(Checkbox 기본 10 + 2). 문구(행간 24)가 상자 행(22)을 키우지 않게 위아래 −1 → 행 높이 74
          label={<span className="-my-px ml-0.5 text-body-l-strong text-primary">{allLabel}</span>}
          checked={all}
          disabled={loading || items.length === 0}
          onChange={(e) => onToggleAll(e.currentTarget.checked)}
        />
      </div>
      {loading ? (
        <div role="status" aria-label="불러오는 중" className="mt-3 flex flex-col gap-1">
          {Array.from({ length: SKELETON_ROWS }, (_, i) => (
            <div key={i} className="flex items-center gap-3 py-4 pl-5">
              <div className="size-5 shrink-0 animate-pulse rounded-full bg-muted motion-reduce:animate-none" />
              <div className="h-4 w-1/2 animate-pulse rounded-sm bg-muted motion-reduce:animate-none" />
            </div>
          ))}
        </div>
      ) : (
        <ul className="mt-3 flex flex-col gap-1">
          {items.map((item) => (
            <li key={item.id}>
              <RowConsent
                title={item.title}
                required={item.required ?? true}
                checked={item.checked}
                chevron={item.chevron}
                onChange={(e) => onToggle(item.id, e.currentTarget.checked)}
              />
            </li>
          ))}
        </ul>
      )}
      {cta && (
        <Button
          type="primary"
          size="l"
          className="mt-6 w-full"
          {...cta}
          disabled={loading || !requiredDone || cta.disabled}
        />
      )}
    </div>
  )
}
