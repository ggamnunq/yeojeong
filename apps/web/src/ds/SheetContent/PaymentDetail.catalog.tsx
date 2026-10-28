import { useState } from 'react'
import { defineCatalog } from '../../catalog/catalog'
import { GROUP, ME, MINJI, SUBIN, TAEHYUN } from '../../catalog/people'
import { Row, Variant } from '../../catalog/ui'
import { BottomSheetPanel } from '../BottomSheet/BottomSheet'
import { SheetContentPaymentDetail, type PaymentDetailParticipant, type PaymentExpenseType } from './PaymentDetail'

const FOUR: PaymentDetailParticipant[] = [
  { ...ME, selected: true },
  { ...MINJI, selected: true },
  { ...TAEHYUN, selected: false },
  { ...SUBIN, selected: true },
]
const SIX: PaymentDetailParticipant[] = GROUP.map((p) => ({ ...p, selected: true }))

function Interactive({
  start,
  initialType,
  amount = 28400,
  pending,
  changed,
  showParticipantsWhenPersonal,
}: {
  start: PaymentDetailParticipant[]
  initialType: PaymentExpenseType
  amount?: number
  pending?: boolean
  changed?: boolean
  showParticipantsWhenPersonal?: boolean
}) {
  const [expenseType, setExpenseType] = useState(initialType)
  const [people, setPeople] = useState(start)
  return (
    <SheetContentPaymentDetail
      className="w-[350px]"
      merchant="이치란 라멘 도톤보리점"
      amount={amount}
      detail="¥3,200 · 100엔 = 887.5원 · 10.28 12:40 · 민지"
      pending={pending}
      changed={changed}
      expenseType={expenseType}
      onExpenseTypeChange={setExpenseType}
      participants={people}
      showParticipantsWhenPersonal={showParticipantsWhenPersonal}
      onParticipantChange={(index, selected) => setPeople((prev) => prev.map((p, i) => (i === index ? { ...p, selected } : p)))}
    />
  )
}

export default defineCatalog({
  title: 'SheetContent/PaymentDetail',
  figma: '24:18023',
  group: 'components',
  order: 33,
  Demo: function PaymentDetailCatalog() {
    return (
      <Row className="items-start">
        <Variant name="공동 · 3명 선택 → 1인 내림 + 결제자 +2원 (눌러서 바꿔 보기)">
          <Interactive start={FOUR} initialType="shared" />
        </Variant>
        <Variant name="6명(Person 3~6) · changed">
          <Interactive start={SIX} initialType="shared" amount={102000} changed />
        </Variant>
        <Variant name="pending · 개인(부담 인원 숨김)">
          <Interactive start={FOUR} initialType="personal" pending />
        </Variant>
        <Variant name="개인 · showParticipantsWhenPersonal(비활성 토글)">
          <Interactive start={FOUR} initialType="personal" showParticipantsWhenPersonal />
        </Variant>
        <Variant name="BottomSheet(겉모습) Content 슬롯에 넣은 모습 · 폭 390">
          <div className="w-[390px] bg-dim pt-10">
            <BottomSheetPanel title="결제 상세" cta={{ label: '저장' }}>
              <Interactive start={FOUR} initialType="shared" />
            </BottomSheetPanel>
          </div>
        </Variant>
      </Row>
    )
  },
})
