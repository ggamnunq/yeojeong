import { clsx } from 'clsx'
import { useId, type HTMLAttributes, type ReactNode } from 'react'
import { budgetPercent, budgetRatio, budgetState, type BudgetProgressState } from '../BudgetProgress/rules'
import { formatKrw } from '../format'

// Figma MetricBar(52:10206, v1.5) · Type=Single/Split + Total(BOOLEAN). 현황(HF-22)의 지표 + 막대 블록 — 카드·테두리 없이.
// 라벨(Body/S text/secondary) → 금액(Amount/M) [+ "/ 총액"(Caption text/tertiary)] → 막대 6(radius full) [→ 범례], 간격 10.
// Single = 예산 대비 공동 지출(track + fill, 정상·주의·초과 색) · Split = 내 지출 공동·개인 2분할(2px 틈) + 범례.
export type MetricBarType = 'single' | 'split'

export type MetricBarProps = Omit<HTMLAttributes<HTMLElement>, 'children'> & {
  /** Figma Type. 기본 single */
  type?: MetricBarType
  /** Figma label: "공동 지출" · "내 지출" */
  label: ReactNode
  /** Figma amount(원) */
  amount: number
  /**
   * Single — Figma Total: "/ ₩1,200,000"과 막대의 분모(예산, 원). 없거나 0이면 총액·막대를 그리지 않는다(예산 없음).
   * 넘으면 라벨 줄 오른쪽에 "초과 ₩N"(HF #48).
   */
  total?: number
  /** Single 막대 색(정상 · 주의 · 초과). 생략하면 amount/total 비율로(BudgetProgress와 같은 기준) */
  state?: BudgetProgressState
  /** Split — 공동 비율(%, 0~100). shared·personal이 둘 다 null이면 빈 막대 · 범례 없음(내 지출 0) */
  shared?: number | null
  /** Split — 개인 비율(%, 0~100) */
  personal?: number | null
  /** 범례 이름. 기본 "공동" · "개인" */
  sharedLabel?: string
  personalLabel?: string
  /** 라벨을 제목(h2~h4)으로 — 블록이 section이 되고 제목으로 이름 붙는다. 생략하면 p */
  headingLevel?: 2 | 3 | 4
  children?: never
}

const FILL = {
  normal: 'bg-budget-fill',
  caution: 'bg-budget-caution',
  over: 'bg-budget-over',
} satisfies Record<BudgetProgressState, string>

export function MetricBar({
  type = 'single',
  label,
  amount,
  total,
  state,
  shared = null,
  personal = null,
  sharedLabel = '공동',
  personalLabel = '개인',
  headingLevel,
  className,
  ...rest
}: MetricBarProps) {
  const labelId = useId()
  const Root = headingLevel ? 'section' : 'div'
  const Label = headingLevel ? (`h${headingLevel}` as const) : 'p'
  const single = type === 'single'
  const hasTotal = single && total !== undefined && total > 0
  const over = hasTotal ? Math.max(0, amount - total) : 0

  return (
    <Root aria-labelledby={headingLevel ? labelId : undefined} className={clsx('flex w-full flex-col gap-2.5', className)} {...rest}>
      <div className="flex items-center justify-between gap-2">
        <Label id={labelId} className="text-body-s text-secondary">
          {label}
        </Label>
        {over > 0 && <span className="text-caption whitespace-nowrap text-error">초과 {formatKrw(over)}</span>}
      </div>
      <p className="flex items-baseline gap-1.5 whitespace-nowrap">
        <span className="font-amount text-amount-m text-amount-default">{formatKrw(amount)}</span>
        {hasTotal && <span className="text-caption text-tertiary">/ {formatKrw(total)}</span>}
      </p>
      {single ? (
        hasTotal && <SingleBar amount={amount} total={total} state={state} labelId={labelId} />
      ) : (
        <SplitBar shared={shared} personal={personal} sharedLabel={sharedLabel} personalLabel={personalLabel} />
      )}
    </Root>
  )
}

function SingleBar({ amount, total, state, labelId }: { amount: number; total: number; state?: BudgetProgressState; labelId: string }) {
  const ratio = budgetRatio(amount, total)
  const current = state ?? budgetState(ratio)
  const percent = budgetPercent(ratio) ?? 100
  const over = Math.max(0, amount - total)
  // 막대는 0~100%로 자른다(초과면 꽉 참)
  const width = Math.min(1, ratio) * 100
  return (
    <div
      role="meter"
      aria-labelledby={labelId}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={Math.min(100, percent)}
      aria-valuetext={`${formatKrw(amount)} / ${formatKrw(total)}, ${percent}% 사용${over > 0 ? `, 초과 ${formatKrw(over)}` : ''}`}
      data-state={current}
      className="h-1.5 overflow-hidden rounded-full bg-budget-track"
    >
      <div className={clsx('h-full rounded-full', FILL[current])} style={{ width: `${width}%` }} />
    </div>
  )
}

function SplitBar({
  shared,
  personal,
  sharedLabel,
  personalLabel,
}: {
  shared: number | null
  personal: number | null
  sharedLabel: string
  personalLabel: string
}) {
  const s = Math.max(0, shared ?? 0)
  const p = Math.max(0, personal ?? 0)
  const empty = (shared === null && personal === null) || s + p === 0
  const legend = `${sharedLabel} ${s}% · ${personalLabel} ${p}%`
  return (
    <>
      {/* Figma: 트랙 없이 두 막대 + 2px 틈. 비었을 때만 트랙 색 */}
      <div
        role={empty ? undefined : 'img'}
        aria-label={empty ? undefined : legend}
        aria-hidden={empty || undefined}
        className={clsx('flex h-1.5 gap-0.5 overflow-hidden rounded-full', empty && 'bg-budget-track')}
      >
        {!empty && s > 0 && (
          <div data-part="shared" className="h-full basis-0 rounded-full bg-expense-shared-solid" style={{ flexGrow: s }} />
        )}
        {!empty && p > 0 && (
          <div data-part="personal" className="h-full basis-0 rounded-full bg-expense-personal-solid" style={{ flexGrow: p }} />
        )}
      </div>
      {/* 범례는 막대의 눈으로 보는 열쇠 — 같은 내용을 막대(role=img)가 읽어 주므로 스크린리더에서는 숨긴다 */}
      {!empty && (
        <ul aria-hidden className="flex items-center gap-4">
          <li className="flex items-center gap-1.5 text-caption text-tertiary">
            <span className="size-1.5 rounded-full bg-expense-shared-solid" />
            {sharedLabel} {s}%
          </li>
          <li className="flex items-center gap-1.5 text-caption text-tertiary">
            <span className="size-1.5 rounded-full bg-expense-personal-solid" />
            {personalLabel} {p}%
          </li>
        </ul>
      )}
    </>
  )
}
