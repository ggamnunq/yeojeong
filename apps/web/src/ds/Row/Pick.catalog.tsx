import { useState } from 'react'
import { defineCatalog } from '../../catalog/catalog'
import { Row, Sub, Variant } from '../../catalog/ui'
import { Checkbox } from '../Checkbox/Checkbox'
import { RowPick } from './Pick'

// HF-56 카드 내역 불러오기 시안의 행들(취소·이미 추가는 Disabled)
const CARD = [
  { id: 'a', title: '유니클로 난바점', meta: '19:05 · 오사카 3박 4일', amount: '−₩58,830', sub: '−¥6,400', chip: '취소됨', disabled: true },
  { id: 'b', title: '551 호라이 난바본점', meta: '18:22 · 오사카 3박 4일', amount: '¥2,800', sub: '약 ₩25,740', chip: '비슷한 기록' },
  { id: 'c', title: '다카시마야 난바점', meta: '15:40 · 오사카 3박 4일', amount: '₩110,300', sub: '¥12,000' },
  { id: 'd', title: 'MK택시', meta: '14:10 · 오사카 3박 4일', amount: '₩26,290', sub: '¥2,860', chip: '추가됨', disabled: true },
  { id: 'e', title: '빅카메라 난바점', meta: '12:30 · 오사카 3박 4일', amount: '₩134,880', sub: '부분 취소 −₩3,000' },
] as const

function CardImport() {
  const pickable = CARD.filter((c) => !('disabled' in c)).map((c) => c.id)
  const [picked, setPicked] = useState<string[]>(['c', 'e'])
  const all = picked.length === pickable.length
  return (
    <div className="flex w-[390px] flex-col bg-surface">
      <div className="flex items-center justify-between px-5">
        <Checkbox
          label="전체 선택"
          checked={all}
          indeterminate={picked.length > 0 && !all}
          onChange={() => setPicked(all ? [] : pickable)}
        />
        <span className="text-body-s text-tertiary">{`${pickable.length}건 중 ${picked.length}건`}</span>
      </div>
      {CARD.map((c) => (
        <RowPick
          key={c.id}
          title={c.title}
          meta={c.meta}
          amount={c.amount}
          subAmount={c.sub}
          chip={'chip' in c ? c.chip : undefined}
          disabled={'disabled' in c}
          checked={picked.includes(c.id)}
          onChange={(e) => setPicked((p) => (e.target.checked ? [...p, c.id] : p.filter((x) => x !== c.id)))}
        />
      ))}
    </div>
  )
}

function OutOfPeriod() {
  const [picked, setPicked] = useState<string[]>(['b'])
  const rows = [
    { id: 'a', title: '제주항공', meta: '10.20', amount: '₩184,600' },
    { id: 'b', title: '인천공항 신라면세점', meta: '10.20', amount: '₩62,000' },
    { id: 'c', title: '공항철도', meta: '10.20', amount: '₩9,500' },
  ]
  return (
    <div className="flex w-[390px] flex-col bg-surface">
      {rows.map((r) => (
        <RowPick
          key={r.id}
          title={r.title}
          meta={r.meta}
          amount={r.amount}
          checked={picked.includes(r.id)}
          onChange={(e) => setPicked((p) => (e.target.checked ? [...p, r.id] : p.filter((x) => x !== r.id)))}
        />
      ))}
    </div>
  )
}

export default defineCatalog({
  title: 'Row/Pick',
  figma: '115:15176',
  group: 'components',
  order: 88,
  Demo: function RowPickCatalog() {
    return (
      <div className="flex flex-col gap-8">
        <Sub title="State=Default · Selected · Disabled (390 × 68, Meta on · Sub amount on · Chip off)">
          <Row>
            <Variant name="State=Default" className="w-[390px]">
              <div data-figma="115:15113" className="w-full bg-surface">
                <RowPick title="다카시마야 난바점" meta="15:40 · 오사카 3박 4일" amount="₩110,300" subAmount="¥12,000" checked={false} readOnly />
              </div>
            </Variant>
            <Variant name="State=Selected (checked)" className="w-[390px]">
              <div data-figma="115:15136" className="w-full bg-surface">
                <RowPick title="다카시마야 난바점" meta="15:40 · 오사카 3박 4일" amount="₩110,300" subAmount="¥12,000" checked readOnly />
              </div>
            </Variant>
            <Variant name="State=Disabled (disabled)" className="w-[390px]">
              <div data-figma="115:15155" className="w-full bg-surface">
                <RowPick title="다카시마야 난바점" meta="15:40 · 오사카 3박 4일" amount="₩110,300" subAmount="¥12,000" checked={false} disabled readOnly />
              </div>
            </Variant>
          </Row>
        </Sub>
        <Sub title="예: Disabled + chip(Tag Label) · Sub amount off(HF-43, Meta text = 날짜)">
          <Row>
            <Variant name='disabled · chip="추가됨"' className="w-[390px]">
              <div className="w-full bg-surface">
                <RowPick title="MK택시" meta="14:10 · 오사카 3박 4일" amount="₩26,290" subAmount="¥2,860" chip="추가됨" checked={false} disabled readOnly />
              </div>
            </Variant>
            <Variant name="subAmount 없음 · meta 날짜(HF-43)" className="w-[390px]">
              <div className="w-full bg-surface">
                <RowPick title="제주항공" meta="10.20" amount="₩184,600" checked={false} readOnly />
              </div>
            </Variant>
          </Row>
        </Sub>
        <Sub title="흐름: HF-56 카드 내역 불러오기 — 전체 선택(Checkbox indeterminate) + Row/Pick · HF-43 기간 외 결제">
          <Row>
            <Variant name="HF-56 (눌러서 선택 · 전체 선택은 일부면 mixed)">
              <CardImport />
            </Variant>
            <Variant name="HF-43">
              <OutOfPeriod />
            </Variant>
          </Row>
        </Sub>
      </div>
    )
  },
})
