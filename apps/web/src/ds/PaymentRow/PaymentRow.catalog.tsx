import { defineCatalog } from '../../catalog/catalog'
import { GROUP, INITIAL, ME } from '../../catalog/people'
import { Sub } from '../../catalog/ui'
import { Divider } from '../Divider/Divider'
import { formatMoney } from '../format'
import { PaymentRow } from './PaymentRow'

export default defineCatalog({
  title: 'PaymentRow',
  figma: '24:8257',
  group: 'components',
  order: 23,
  Demo: function PaymentRowCatalog() {
    return (
      <div className="flex flex-col gap-8">
        <Sub title="type × Pressed(눌러서 확인) · 폭 390">
          <div className="flex w-[390px] flex-col">
            <PaymentRow
              type="shared"
              payer={INITIAL.minji}
              merchant="이치란 라멘 도톤보리점"
              meta="12:40 · 민지"
              amount={28400}
              originalAmount={formatMoney(3200, 'JPY')}
              participants={GROUP.slice(0, 4)}
            />
            <Divider type="inset" />
            <PaymentRow
              type="personal"
              payer={INITIAL.seojun}
              merchant="돈키호테 난바점"
              meta="14:05 · 내 결제"
              amount={41300}
              originalAmount={formatMoney(4650, 'JPY')}
            />
            <Divider type="inset" />
            <PaymentRow
              type="pending"
              payer={INITIAL.harin}
              merchant="FamilyMart 난바역"
              meta="15:12 · 하린"
              amount={5320}
              originalAmount={formatMoney(599, 'JPY')}
            />
            <Divider type="inset" />
            <PaymentRow
              type="refund"
              payer={INITIAL.seojun}
              merchant="이치란 라멘 도톤보리점"
              meta="원 결제 10.28 12:40 · 취소"
              amount={28400}
              originalAmount={formatMoney(-3200, 'JPY')}
            />
            <Divider type="inset" />
            <PaymentRow
              type="duplicate"
              payer={INITIAL.harin}
              merchant="FamilyMart 난바역"
              meta="15:12 · 하린 · 같은 금액 2건"
              amount={5320}
              originalAmount={formatMoney(599, 'JPY')}
            />
          </div>
        </Sub>
        <Sub title="changed · 2명 · 5명 이상 · 사진 결제자 · 긴 가맹점명">
          <div className="flex w-[390px] flex-col">
            <PaymentRow
              payer={ME}
              merchant="MK택시"
              meta="14:10 · 내 결제"
              amount={26290}
              originalAmount={formatMoney(2860, 'JPY')}
              participants={GROUP.slice(0, 2)}
              changed
            />
            <Divider type="inset" />
            <PaymentRow
              payer={GROUP[2]}
              merchant="우메다 스카이빌딩 공중정원 전망대 입장권 6매"
              meta="16:40 · 태현"
              amount={102000}
              originalAmount={formatMoney(11400, 'JPY')}
              participants={GROUP}
            />
          </div>
        </Sub>
      </div>
    )
  },
})
