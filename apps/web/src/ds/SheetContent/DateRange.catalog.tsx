import { useState } from 'react'
import { defineCatalog } from '../../catalog/catalog'
import { Row, Sub, Variant } from '../../catalog/ui'
import { BottomSheet, BottomSheetPanel } from '../BottomSheet/BottomSheet'
import { InputPicker } from '../Input/Picker'
import { SheetContentDateRange } from './DateRange'
import { formatDateRange, type DateRangeValue } from './rules'

// Figma 시안과 같은 날: 오늘 11.5, 11.12(목) – 11.15(일)
const TODAY = '2026-11-05'

function Fixed({ initial, ...rest }: { initial: DateRangeValue } & Omit<Parameters<typeof SheetContentDateRange>[0], 'value' | 'onChange'>) {
  const [value, setValue] = useState(initial)
  return <SheetContentDateRange value={value} onChange={setValue} {...rest} />
}

// Input Picker → BottomSheet(시트 CTA 끔) + SheetContent/DateRange(내용 CTA "확인")
function PickerFlow() {
  const [open, setOpen] = useState(false)
  const [value, setValue] = useState<DateRangeValue>({ start: null, end: null })
  const [draft, setDraft] = useState<DateRangeValue>(value)
  return (
    <>
      <InputPicker
        label="기간"
        placeholder="출발일 – 도착일"
        value={formatDateRange(value)}
        onClick={() => {
          setDraft(value)
          setOpen(true)
        }}
        className="w-[350px]"
      />
      <BottomSheet open={open} title="기간" onClose={() => setOpen(false)}>
        <SheetContentDateRange
          value={draft}
          onChange={setDraft}
          today={TODAY}
          maxDays={30}
          cta={{
            onClick: () => {
              setValue(draft)
              setOpen(false)
            },
          }}
        />
      </BottomSheet>
    </>
  )
}

export default defineCatalog({
  title: 'SheetContent/DateRange',
  figma: '61:10354',
  group: 'components',
  order: 86,
  Demo: function SheetContentDateRangeCatalog() {
    return (
      <div className="flex flex-col gap-8">
        <Sub title="Figma 기본 (350 폭) · 눌러서 범위 바꾸기 — 칩으로 고르는 쪽 전환">
          <Row>
            <Variant name="CTA on · 처음엔 출발일 칩(Figma) — 고른 뒤 도착일 칩으로">
              <div className="w-[350px]">
                <Fixed initial={{ start: '2026-11-12', end: '2026-11-15' }} today={TODAY} cta={{}} />
              </div>
            </Variant>
            <Variant name="빈 값 · CTA 비활성">
              <div className="w-[350px]">
                <Fixed initial={{ start: null, end: null }} today={TODAY} cta={{}} />
              </div>
            </Variant>
            <Variant name="startLocked(진행 중 수정) · endMin=오늘 · maxDays 7">
              <div className="w-[350px]">
                <Fixed
                  initial={{ start: '2026-11-02', end: '2026-11-06' }}
                  today={TODAY}
                  min="2026-10-01"
                  endMin={TODAY}
                  maxDays={7}
                  startLocked
                  cta={{}}
                />
              </div>
            </Variant>
          </Row>
        </Sub>
        <Sub title="BottomSheet Content 슬롯 — 시트 CTA는 끄고 내용 CTA를 쓴다">
          <div className="w-[390px]">
            <BottomSheetPanel title="기간">
              <Fixed initial={{ start: '2026-11-12', end: '2026-11-15' }} today={TODAY} cta={{}} />
            </BottomSheetPanel>
          </div>
        </Sub>
        <Sub title="흐름: Input Type=Picker → 시트 → 확인">
          <PickerFlow />
        </Sub>
      </div>
    )
  },
})
