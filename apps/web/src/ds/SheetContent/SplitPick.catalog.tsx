import { useState } from 'react'
import { defineCatalog } from '../../catalog/catalog'
import { GROUP, HARIN, ME, MINJI, SEOJUN, SUBIN, TAEHYUN } from '../../catalog/people'
import { Row, Variant } from '../../catalog/ui'
import { splitPickSummary } from './rules'
import { SheetContentSplitPick, type SplitPickMember } from './SplitPick'

const MEMBERS: SplitPickMember[] = [
  { ...ME, id: 'me' },
  { ...MINJI, id: 'minji' },
  { ...TAEHYUN, id: 'taehyun' },
  { ...SUBIN, id: 'subin' },
]

// ₩11,030(¥1,200) 나누기. 명세 규칙(FR-509): 1인 내림 + 나머지는 결제자 → 3명이면 ₩3,676 + "결제자 +2원"
const AMOUNT = 11030

function Multiple({ initial, members = MEMBERS }: { initial: string[]; members?: SplitPickMember[] }) {
  const [selected, setSelected] = useState(initial)
  const summary = splitPickSummary(AMOUNT, selected.length)
  return (
    <SheetContentSplitPick
      members={members}
      selected={selected}
      onChange={setSelected}
      personal={selected.length === 1 && selected[0] === 'me'}
      perPerson={summary.perPerson}
      remainder={summary.remainder}
    />
  )
}

function Single() {
  const [payer, setPayer] = useState<string | null>('me')
  return <SheetContentSplitPick mode="single" members={MEMBERS} selected={payer} onChange={setPayer} />
}

export default defineCatalog({
  title: 'SheetContent/SplitPick',
  figma: '79:11072',
  group: 'components',
  order: 88,
  Demo: function SplitPickCatalog() {
    const six: SplitPickMember[] = GROUP.map((p, i) => ({ ...p, id: `m${i}` }))
    return (
      <Row>
        <Variant name="나누기 HF-47 · 3명 · 결제자 +2원 · 1인 ₩3,676 (눌러서 바꿔 보기)">
          <div className="w-[350px]">
            <Multiple initial={['me', 'minji', 'taehyun']} />
          </div>
        </Variant>
        <Variant name="나만 선택 HF-47b · personal (자물쇠 개인)">
          <div className="w-[350px]">
            <Multiple initial={['me']} />
          </div>
        </Variant>
        <Variant name='결제자 mode="single" (요약 없음 · 라디오 · ←→)'>
          <div className="w-[350px]">
            <Single />
          </div>
        </Variant>
        <Variant name="6명 · 줄바꿈 · 나간 멤버 disabled(수정 WF-50)">
          <div className="w-[350px]">
            <Multiple
              initial={['m0', 'm1', 'm4']}
              members={six.map((m) => (m.name === SEOJUN.name || m.name === HARIN.name ? { ...m, left: true, disabled: m.name === HARIN.name } : m))}
            />
          </div>
        </Variant>
      </Row>
    )
  },
})
