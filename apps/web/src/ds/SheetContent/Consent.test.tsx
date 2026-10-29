import { fireEvent, render, screen } from '@testing-library/react'
import { useState } from 'react'
import { describe, expect, it, vi } from 'vitest'
import { RowConsent } from '../Row/Consent'
import { SheetContentConsent, type SheetContentConsentItem } from './Consent'
import { consentAllChecked, consentRequiredDone } from './rules'

const DOCS = [
  { id: 'FIN_LINK', title: '금융정보 연동 약관' },
  { id: 'FIN_PRIVACY', title: '금융정보 수집·이용' },
  { id: 'MARKETING', title: '마케팅 정보 수신', required: false },
]

/** 부모가 체크 상태를 쥐는 실제 사용 모양 */
function Harness({ onConfirm = () => {} }: { onConfirm?: () => void }) {
  const [checked, setChecked] = useState<ReadonlySet<string>>(new Set())
  const items: SheetContentConsentItem[] = DOCS.map((d) => ({
    ...d,
    checked: checked.has(d.id),
    chevron: { label: `${d.title} 전문`, href: `/legal/${d.id}` },
  }))
  return (
    <SheetContentConsent
      items={items}
      onToggleAll={(next) => setChecked(new Set(next ? DOCS.map((d) => d.id) : []))}
      onToggle={(id, next) =>
        setChecked((prev) => {
          const set = new Set(prev)
          if (next) set.add(id)
          else set.delete(id)
          return set
        })
      }
      cta={{ label: '동의하고 연결', onClick: onConfirm }}
    />
  )
}

const box = (name: string | RegExp) => screen.getByRole('checkbox', { name }) as HTMLInputElement

describe('consent rules', () => {
  it('전체 동의 = 모두 체크, CTA = 필수(기본 required) 모두 체크. 빈 목록은 둘 다 false', () => {
    expect(consentAllChecked([])).toBe(false)
    expect(consentRequiredDone([])).toBe(false)
    expect(consentAllChecked([{ checked: true }, { checked: false, required: false }])).toBe(false)
    expect(consentRequiredDone([{ checked: true }, { checked: false, required: false }])).toBe(true)
    expect(consentRequiredDone([{ checked: false }, { checked: true, required: false }])).toBe(false)
  })
})

describe('RowConsent', () => {
  it('체크 + "[필수]"/"[선택]" + 제목 전체가 체크박스 이름이고, ›는 따로 누르는 링크다', () => {
    const onChange = vi.fn()
    render(
      <RowConsent
        title="금융정보 연동 약관"
        checked={false}
        onChange={onChange}
        chevron={{ label: '금융정보 연동 약관 전문', href: '/legal/fin' }}
      />,
    )
    fireEvent.click(screen.getByText('금융정보 연동 약관'))
    expect(onChange).toHaveBeenCalledTimes(1)
    expect(box('[필수] 금융정보 연동 약관')).toBeTruthy()
    const link = screen.getByRole('link', { name: '금융정보 연동 약관 전문' })
    expect(link.getAttribute('href')).toBe('/legal/fin')
    fireEvent.click(link)
    expect(onChange).toHaveBeenCalledTimes(1)
  })

  it('required={false}면 "[선택]", chevron에 href가 없으면 버튼, 없으면 › 자체가 없다', () => {
    const onClick = vi.fn()
    const { rerender } = render(
      <RowConsent title="마케팅 정보 수신" checked required={false} readOnly chevron={{ label: '전문', onClick }} />,
    )
    expect(box('[선택] 마케팅 정보 수신').checked).toBe(true)
    fireEvent.click(screen.getByRole('button', { name: '전문' }))
    expect(onClick).toHaveBeenCalledTimes(1)
    rerender(<RowConsent title="마케팅 정보 수신" checked required={false} readOnly />)
    expect(screen.queryByRole('button')).toBeNull()
    expect(screen.queryByRole('link')).toBeNull()
  })
})

describe('SheetContentConsent', () => {
  it('전체 동의를 누르면 모든 행이 켜지고 다시 누르면 모두 꺼진다', () => {
    render(<Harness />)
    fireEvent.click(box('전체 동의'))
    expect(DOCS.every((d) => box(new RegExp(d.title)).checked)).toBe(true)
    expect(box('전체 동의').checked).toBe(true)
    fireEvent.click(box('전체 동의'))
    expect(DOCS.some((d) => box(new RegExp(d.title)).checked)).toBe(false)
  })

  it('행을 하나씩 모두 켜면 전체 동의도 켜지고, 하나를 끄면 전체 동의가 꺼진다', () => {
    render(<Harness />)
    for (const d of DOCS) fireEvent.click(box(new RegExp(d.title)))
    expect(box('전체 동의').checked).toBe(true)
    fireEvent.click(box(/마케팅/))
    expect(box('전체 동의').checked).toBe(false)
  })

  it('CTA는 필수 행이 모두 체크돼야 활성([선택]은 상관없다)', () => {
    const onConfirm = vi.fn()
    render(<Harness onConfirm={onConfirm} />)
    const cta = screen.getByRole('button', { name: '동의하고 연결' }) as HTMLButtonElement
    expect(cta.disabled).toBe(true)
    fireEvent.click(box(/금융정보 연동 약관/))
    expect(cta.disabled).toBe(true)
    fireEvent.click(box(/금융정보 수집/))
    expect(cta.disabled).toBe(false)
    fireEvent.click(cta)
    expect(onConfirm).toHaveBeenCalledTimes(1)
  })

  it('cta.disabled는 필수 충족이어도 막고, loading이면 스켈레톤 + 전체 동의·CTA 비활성', () => {
    const items = DOCS.map((d) => ({ ...d, checked: true }))
    const { rerender } = render(
      <SheetContentConsent items={items} onToggle={() => {}} onToggleAll={() => {}} cta={{ label: '동의', disabled: true }} />,
    )
    expect((screen.getByRole('button', { name: '동의' }) as HTMLButtonElement).disabled).toBe(true)
    rerender(<SheetContentConsent items={items} onToggle={() => {}} onToggleAll={() => {}} cta={{ label: '동의' }} loading />)
    expect(screen.getByRole('status', { name: '불러오는 중' })).toBeTruthy()
    expect(box('전체 동의').disabled).toBe(true)
    expect((screen.getByRole('button', { name: '동의' }) as HTMLButtonElement).disabled).toBe(true)
  })
})
