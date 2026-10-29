import { clsx } from 'clsx'
import type { InputHTMLAttributes, MouseEventHandler, ReactNode } from 'react'
import { Icon } from '../Icon/Icon'
import { focusRing, touchTarget } from '../styles'

// Figma Row/Consent(52:10120, v1.5) · Checked=On/Off × Required=Yes/No + Title(TEXT) · Chevron(BOOLEAN). 약관 동의 행(HF-04 · HF-05b).
// 체크(20, On = icon/brand · Off = icon/disabled) + "[필수]"/"[선택]" + 제목(Body/M text/primary) + ›(16, 약관 전문, 오른쪽 끝). 왼쪽 20 · 오른쪽 0 · 위아래 15 → 높이 52.
// v1.7: HF-04 실제 화면 기준으로 정렬(높이 50 → 52, 패딩 14/4/14/20 → 15/0/15/20, 글자 text/secondary → text/primary).
// 체크 + 라벨 전체가 진짜 체크박스(누르는 영역)이고, ›는 따로 누르는 링크/버튼이다. 보통 SheetContentConsent 안에서 쓴다.

/** Figma Chevron. 객체를 주면 켜진다. href가 있으면 링크(라우터 이동은 onClick에서 preventDefault 후 navigate), 없으면 버튼 */
export type RowConsentChevron = {
  /** 접근성 이름. 문서마다 구분되게 "금융정보 연동 약관 전문"처럼 */
  label: string
  href?: string
  onClick?: MouseEventHandler<HTMLElement>
}

export type RowConsentProps = Omit<
  InputHTMLAttributes<HTMLInputElement>,
  'type' | 'title' | 'children' | 'checked' | 'defaultChecked' | 'required' | 'className'
> & {
  /** Figma Title: 문서 제목. 앞의 "[필수]"/"[선택]"은 required로 붙는다 */
  title: ReactNode
  /** Figma Checked */
  checked: boolean
  /** Figma Required: true = "[필수]"(Yes) · false = "[선택]"(No). 기본 true */
  required?: boolean
  /** Figma Chevron: 오른쪽 › (약관 전문 보기) */
  chevron?: RowConsentChevron
  className?: string
}

export function RowConsent({ title, checked, required = true, chevron, disabled, className, ...rest }: RowConsentProps) {
  return (
    <div className={clsx('flex w-full items-center gap-3 pl-5', className)}>
      <label
        className={clsx(
          'flex min-w-0 flex-1 items-center gap-3 rounded-sm py-3.75 select-none has-focus-visible:shadow-focus-ring',
          disabled ? 'cursor-not-allowed' : 'cursor-pointer',
        )}
      >
        <input type="checkbox" className="sr-only" checked={checked} disabled={disabled} {...rest} />
        <Icon
          name="check"
          size={20}
          className={clsx('shrink-0 transition-colors', checked && !disabled ? 'text-icon-brand' : 'text-icon-disabled')}
        />
        <span className={clsx('flex min-w-0 flex-1 gap-1 text-body-m', disabled ? 'text-disabled' : 'text-primary')}>
          <span className="shrink-0">{required ? '[필수]' : '[선택]'}</span>
          {/* 접근성 이름 띄어쓰기용(flex 안의 공백 글자는 그려지지 않아 간격은 gap 4 그대로) */}{' '}
          <span className="min-w-0">{title}</span>
        </span>
      </label>
      {chevron && <ChevronLink {...chevron} />}
    </div>
  )
}

function ChevronLink({ label, href, onClick }: RowConsentChevron) {
  const className = clsx('inline-flex shrink-0 rounded-full text-icon-subtle', focusRing, touchTarget)
  const icon = <Icon name="chevron-right" size={16} />
  return href ? (
    <a href={href} aria-label={label} onClick={onClick} className={className}>
      {icon}
    </a>
  ) : (
    <button type="button" aria-label={label} onClick={onClick} className={className}>
      {icon}
    </button>
  )
}
