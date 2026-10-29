import { useState } from 'react'
import { defineCatalog } from '../../catalog/catalog'
import { Row, Sub, Variant } from '../../catalog/ui'
import { BottomSheet, BottomSheetPanel } from '../BottomSheet/BottomSheet'
import { RowField } from '../Row/Field'
import { SheetContentDateTime, type SheetContentDateTimeProps } from './DateTime'
import { dateTimeDraft, dateTimeIso, formatDateTimeValue, type DateTimeDraft } from './rules'

// Figma 시안과 같은 시점: 지금 2026-11-13(금) 15:15 KST → 15:20까지 고를 수 있고 14일부터 흐림
const NOW = Date.parse('2026-11-13T15:15:00+09:00')
const FIGMA: DateTimeDraft = { date: '2026-11-13', hour: '15', minute: '20' }

function Fixed({ initial, ...rest }: { initial: DateTimeDraft } & Omit<SheetContentDateTimeProps, 'value' | 'onChange'>) {
  const [value, setValue] = useState(initial)
  return <SheetContentDateTime value={value} onChange={setValue} now={NOW} {...rest} />
}

// HF-46d: Row/Field "날짜"(손대지 않으면 "지금") → 같은 시트 안 단계(‹ "날짜", ✕ 없음, 시트 CTA 끔) + 내용 CTA "확인"
function FieldFlow() {
  const [open, setOpen] = useState(false)
  const [occurredAt, setOccurredAt] = useState<string | null>(null)
  const [draft, setDraft] = useState<DateTimeDraft>(() => dateTimeDraft(null, NOW))
  return (
    <div className="flex w-[350px] flex-col">
      <RowField
        label="날짜"
        value={formatDateTimeValue(occurredAt)}
        onClick={() => {
          setDraft(dateTimeDraft(occurredAt, NOW))
          setOpen(true)
        }}
      />
      <p className="text-caption text-tertiary">{`값: ${occurredAt ?? 'null(지금)'}`}</p>
      <BottomSheet open={open} title="날짜" leading="back" onBack={() => setOpen(false)} onClose={() => setOpen(false)}>
        <SheetContentDateTime
          value={draft}
          onChange={setDraft}
          now={NOW}
          cta={{
            onClick: () => {
              setOccurredAt(dateTimeIso(draft))
              setOpen(false)
            },
          }}
        />
      </BottomSheet>
    </div>
  )
}

export default defineCatalog({
  title: 'SheetContent/DateTime',
  figma: '117:15428',
  group: 'components',
  order: 87,
  Demo: function SheetContentDateTimeCatalog() {
    return (
      <div className="flex flex-col gap-8">
        <Sub title="Mode=DateTime(기본) · Date — 지금 11.13 15:15 고정(now prop), 지금+5분 이후 · 365일 이전 흐림, 이번 달이라 › 비활성">
          <Row>
            <Variant name="Mode=DateTime · CTA on (Figma 117:15184)">
              <div data-figma="117:15184" className="w-[350px]">
                <Fixed initial={FIGMA} cta={{}} />
              </div>
            </Variant>
            <Variant name='mode="date" · CTA on (Figma 117:15311)'>
              <div data-figma="117:15311" className="w-[350px]">
                <Fixed initial={FIGMA} mode="date" cta={{}} />
              </div>
            </Variant>
            <Variant name="오늘 + 15:30(지금+5분 넘음) → 칸 빨강 · 확인 비활성">
              <div className="w-[350px]">
                <Fixed initial={{ ...FIGMA, minute: '30' }} cta={{}} />
              </div>
            </Variant>
            <Variant name="365일 전 달(2025년 11월) — ‹ 비활성, 13일 이전 흐림">
              <div className="w-[350px]">
                <Fixed initial={{ date: '2025-11-20', hour: '09', minute: '00' }} cta={{}} />
              </div>
            </Variant>
          </Row>
        </Sub>
        <Sub title='BottomSheet Content 슬롯(HF-46d) — leading="back" · ✕ 없음 · 시트 CTA 끔, 제목 "날짜"'>
          <div className="w-[390px]">
            <BottomSheetPanel title="날짜" leading="back">
              <Fixed initial={FIGMA} cta={{}} />
            </BottomSheetPanel>
          </div>
        </Sub>
        <Sub title='흐름: Row/Field "날짜"("지금" → "11.13 15:20") → 시트 → 확인'>
          <FieldFlow />
        </Sub>
      </div>
    )
  },
})
