import { clsx } from 'clsx'
import { Link } from 'react-router'
import { Checkbox, Icon } from '../../../ds'
import { focusRing, touchTarget } from '../../../ds/styles'
import { consentDocHref } from '../api'
import { consentLabel } from '../consent'
import type { ConsentDocument } from '../types'

// 동의 목록: 전체 동의 톤 행(DS Checkbox) + 항목 행(체크 20 + "[필수] 제목" + › 16).
// Figma v1.4 승격 후보 #9 Row/Consent · SheetContent/Consent(HF-04 24:58149 · HF-05b 24:50880)가 아직 DS 코드에 없어 여기서 조합한다.
// page = WF-04·재동의(전체 동의 아래 12, 행 위아래 15) · sheet = WF-05b(행 사이 4, 행 위아래 13).
export type ConsentListDensity = 'page' | 'sheet'

export type ConsentListProps = {
  /** 화면에 보일 문서(숨김 제외, 서버 순서) */
  docs: readonly ConsentDocument[]
  checked: ReadonlySet<string>
  onToggleAll: (next: boolean) => void
  onToggle: (consentId: string, next: boolean) => void
  density?: ConsentListDensity
  /** 문서 목록을 받는 중이면 행 자리에 스켈레톤 3개 */
  loading?: boolean
  className?: string
}

const SKELETON_ROWS = 3

export function ConsentList({
  docs,
  checked,
  onToggleAll,
  onToggle,
  density = 'page',
  loading = false,
  className,
}: ConsentListProps) {
  const allChecked = docs.length > 0 && docs.every((d) => checked.has(d.consentId))
  const rowPadding = density === 'page' ? 'py-3.75' : 'py-3.25'

  return (
    <div className={clsx('flex flex-col', density === 'sheet' && 'gap-1', className)}>
      <div className="rounded-lg bg-subtle px-5 py-3">
        <Checkbox
          className="w-full"
          label={<span className="text-h3">전체 동의</span>}
          checked={allChecked}
          disabled={loading || docs.length === 0}
          onChange={(e) => onToggleAll(e.currentTarget.checked)}
        />
      </div>
      {loading ? (
        <div role="status" aria-label="불러오는 중" className={clsx('flex flex-col', density === 'page' ? 'pt-3' : 'gap-1')}>
          {Array.from({ length: SKELETON_ROWS }, (_, i) => (
            <div key={i} className={clsx('flex items-center gap-3 pl-5', rowPadding)}>
              <div className="size-5 shrink-0 animate-pulse rounded-full bg-muted motion-reduce:animate-none" />
              <div className="h-4 w-1/2 animate-pulse rounded-sm bg-muted motion-reduce:animate-none" />
            </div>
          ))}
        </div>
      ) : (
        <ul className={clsx('flex flex-col', density === 'page' ? 'pt-3' : 'gap-1')}>
          {docs.map((doc) => {
            const on = checked.has(doc.consentId)
            const href = consentDocHref(doc)
            return (
              <li key={doc.consentId} className="flex items-center gap-3 pl-5">
                <label
                  className={clsx(
                    'flex min-w-0 flex-1 cursor-pointer items-center gap-3 rounded-sm has-focus-visible:shadow-focus-ring',
                    rowPadding,
                  )}
                >
                  <input
                    type="checkbox"
                    className="sr-only"
                    checked={on}
                    onChange={(e) => onToggle(doc.consentId, e.currentTarget.checked)}
                  />
                  <Icon
                    name="check"
                    size={20}
                    className={clsx('shrink-0 transition-colors', on ? 'text-icon-brand' : 'text-icon-disabled')}
                  />
                  <span className="min-w-0 flex-1 text-body-m text-primary">{consentLabel(doc)}</span>
                </label>
                {href && (
                  <Link
                    to={href}
                    aria-label={`${doc.title} 전문`}
                    className={clsx('inline-flex shrink-0 rounded-full text-icon-subtle', focusRing, touchTarget)}
                  >
                    <Icon name="chevron-right" size={16} />
                  </Link>
                )}
              </li>
            )
          })}
        </ul>
      )}
    </div>
  )
}
