import { useState } from 'react'
import { defineCatalog } from '../../catalog/catalog'
import { GROUP, ME, MINJI, SUBIN, TAEHYUN } from '../../catalog/people'
import { PhoneFrame } from '../../catalog/PhoneFrame'
import { Row, SlotScreen, Variant } from '../../catalog/ui'
import type { BottomNavActive } from '../BottomNav/BottomNav'
import { DateHeader } from '../DateHeader/DateHeader'
import { PaymentRow } from '../PaymentRow/PaymentRow'
import { paymentMeta } from '../PaymentRow/rules'
import { RowMemberAmount } from '../Row/MemberAmount'
import { ShellApp } from './App'

function PaymentsList() {
  const [active, setActive] = useState<BottomNavActive>('first')
  return (
    <ShellApp header={{ groupName: '오사카 3박 4일' }} nav={{ active, onChange: setActive, 'aria-label': '여정 메뉴 예시 결제내역' }} gutter={false}>
      <DateHeader date="11.13 (금)" day="Day 2" />
      <PaymentRow type="pending" payer={ME} merchant="551 호라이 난바본점" meta={paymentMeta('18:20', ME)} amount={25740} originalAmount="¥2,800" />
      <PaymentRow payer={MINJI} merchant="우메다 스카이빌딩 공중정원" meta={paymentMeta('16:40', MINJI)} amount={73540} originalAmount="¥8,000" participants={[ME, MINJI, TAEHYUN, SUBIN]} />
      <PaymentRow payer={ME} merchant="MK택시" meta={paymentMeta('14:10', ME)} amount={26290} originalAmount="¥2,860" participants={[ME, MINJI]} />
      <PaymentRow payer={SUBIN} merchant="오사카성 천수각" meta={paymentMeta('10:30', SUBIN)} amount={44120} originalAmount="¥4,800" participants={[ME, MINJI, TAEHYUN, SUBIN]} />
      <div className="h-4" />
      <DateHeader date="11.12 (목)" day="Day 1" />
      <PaymentRow payer={TAEHYUN} merchant="쿠시카츠 다루마 신세카이점" meta={paymentMeta('19:30', TAEHYUN)} amount={117660} originalAmount="¥12,800" participants={[ME, MINJI, TAEHYUN, SUBIN]} />
      <PaymentRow type="personal" payer={ME} merchant="돈키호테 도톤보리점" meta={paymentMeta('17:40', ME)} amount={79420} originalAmount="¥8,640" />
    </ShellApp>
  )
}

function Status() {
  return (
    <ShellApp header={{ groupName: '오사카 3박 4일' }} nav={{ active: 'second', 'aria-label': '여정 메뉴 예시 현황' }}>
      <section className="flex flex-col gap-4 pt-2">
        <h2 className="text-body-s-strong text-secondary">멤버별 부담</h2>
        <div className="flex flex-col">
          {GROUP.slice(0, 4).map((p, i) => (
            <RowMemberAmount key={p.name} person={p} amount={[94770, 81200, 77640, 65020][i]} />
          ))}
        </div>
      </section>
    </ShellApp>
  )
}

export default defineCatalog({
  title: 'Shell/App',
  figma: '24:61193',
  group: 'components',
  order: 70,
  Demo: function ShellAppCatalog() {
    return (
      <Row>
        <Variant name="Figma 기본 · Content = Slot/Screen (헤더 구분선 없음 · 그룹명 H2 · bg/surface)">
          <PhoneFrame>
            <ShellApp header={{ groupName: '오사카 3박 4일' }} nav={{ 'aria-label': '여정 메뉴 예시 셸' }}>
              <SlotScreen />
            </ShellApp>
          </PhoneFrame>
        </Variant>
        <Variant name="결제내역 · gutter={false} (전폭 행은 거터 밖)">
          <PhoneFrame>
            <PaymentsList />
          </PhoneFrame>
        </Variant>
        <Variant name="현황 · 거터 블록 안 Row/MemberAmount">
          <PhoneFrame>
            <Status />
          </PhoneFrame>
        </Variant>
      </Row>
    )
  },
})
