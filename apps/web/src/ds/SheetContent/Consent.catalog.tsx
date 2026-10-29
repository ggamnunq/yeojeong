import { useState } from 'react'
import { defineCatalog } from '../../catalog/catalog'
import { Row, Variant } from '../../catalog/ui'
import { BottomSheetPanel } from '../BottomSheet/BottomSheet'
import { SheetContentConsent, type SheetContentConsentItem } from './Consent'

const DOCS = [
  { id: 'FIN_LINK', title: '금융정보 연동 약관' },
  { id: 'FIN_PRIVACY', title: '금융정보 수집·이용' },
  { id: 'THIRD_PARTY', title: '공동 결제 그룹 공개' },
]
const MARKETING = { id: 'MARKETING', title: '마케팅 정보 수신', required: false }

const items = (docs: typeof DOCS, checked: ReadonlySet<string>): SheetContentConsentItem[] =>
  docs.map((d) => ({ ...d, checked: checked.has(d.id), chevron: { label: `${d.title} 전문`, href: '#consent' } }))

function Interactive({ row4 = false, loading = false }: { row4?: boolean; loading?: boolean }) {
  const docs = row4 ? [...DOCS, MARKETING] : DOCS
  const [checked, setChecked] = useState<ReadonlySet<string>>(new Set())
  const [pending, setPending] = useState(false)
  return (
    <SheetContentConsent
      items={items(docs, checked)}
      loading={loading}
      onToggleAll={(next) => setChecked(new Set(next ? docs.map((d) => d.id) : []))}
      onToggle={(id, next) =>
        setChecked((prev) => {
          const set = new Set(prev)
          if (next) set.add(id)
          else set.delete(id)
          return set
        })
      }
      cta={{
        label: '동의하고 연결',
        state: pending ? 'loading' : 'default',
        onClick: () => {
          setPending(true)
          setTimeout(() => setPending(false), 1500)
        },
      }}
    />
  )
}

export default defineCatalog({
  title: 'SheetContent/Consent',
  figma: '52:10122',
  group: 'components',
  order: 85,
  Demo: function SheetContentConsentCatalog() {
    const all = new Set(DOCS.map((d) => d.id))
    return (
      <div className="flex flex-col gap-8">
        <Row>
          <Variant name="Figma 기본 · 모두 체크 · CTA on" className="w-[350px]">
            <SheetContentConsent items={items(DOCS, all)} onToggle={() => {}} onToggleAll={() => {}} cta={{ label: '동의하고 연결' }} />
          </Variant>
          <Variant name="Row 4([선택]) · 필수만 체크 → CTA 활성" className="w-[350px]">
            <SheetContentConsent
              items={items([...DOCS, MARKETING], all)}
              onToggle={() => {}}
              onToggleAll={() => {}}
              cta={{ label: '동의하고 연결' }}
            />
          </Variant>
          <Variant name="필수 미체크 → CTA 비활성 · 눌러서 토글" className="w-[350px]">
            <Interactive row4 />
          </Variant>
          <Variant name="CTA 없음(cta 생략)" className="w-[350px]">
            <SheetContentConsent items={items(DOCS, new Set(['FIN_LINK']))} onToggle={() => {}} onToggleAll={() => {}} />
          </Variant>
          <Variant name="loading(문서 받는 중)" className="w-[350px]">
            <Interactive loading />
          </Variant>
        </Row>
        <Variant name="BottomSheet Content 슬롯(HF-05b) · 시트 CTA는 끄고 내용의 CTA" className="w-[390px]">
          <div className="w-[390px]">
            <BottomSheetPanel title="금융정보 연동 동의">
              <Interactive />
            </BottomSheetPanel>
          </div>
        </Variant>
      </div>
    )
  },
})
