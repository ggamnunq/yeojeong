import { useState } from 'react'
import { defineCatalog } from '../../catalog/catalog'
import { PhoneFrame } from '../../catalog/PhoneFrame'
import { Row, Variant } from '../../catalog/ui'
import { BottomNav, type BottomNavActive } from '../BottomNav/BottomNav'
import { Icon } from '../Icon/Icon'
import { Input } from '../Input/Input'
import { SegmentedControl } from '../SegmentedControl/SegmentedControl'
import { TopHeader } from '../TopHeader/TopHeader'
import { Screen } from './Screen'

// spec 7-1 조립 예시. 2단계 컴포넌트(EmptyState·PaymentRow 등) 없이 1·3단계 컴포넌트와 글자만으로 만든다.
function PaymentsEmpty() {
  const [active, setActive] = useState<BottomNavActive>('first')
  return (
    <Screen
      header={<TopHeader groupName="오사카 3박 4일" statusBadge />}
      nav={<BottomNav active={active} onChange={setActive} aria-label="여정 메뉴 예시 빈 화면" />}
    >
      {/* EX-01 controls: 패딩 16/20/8, 간격 12 */}
      <div className="pt-4 pb-2">
        <SegmentedControl labels={['리스트', '타임라인']} aria-label="보기" />
      </div>
      <div className="flex flex-1 flex-col items-center justify-center gap-3 pb-16 text-center">
        <span className="flex size-12 items-center justify-center rounded-full bg-subtle">
          <Icon name="receipt" size={24} className="text-icon-subtle" />
        </span>
        <p className="text-h3 text-primary">아직 결제 내역이 없어요</p>
        <p className="text-body-m text-secondary">
          연결한 계좌·카드로 결제하면
          <br />
          여기에 자동으로 모여요
        </p>
      </div>
    </Screen>
  )
}

function CreateTrip() {
  return (
    <Screen header={<TopHeader type="back" title="여정 만들기" />} cta={{ label: '다음' }} background="surface">
      <div className="flex flex-col gap-6 pt-4">
        <Input label="그룹 이름" placeholder="예: 오사카 3박 4일" />
        <Input label="여행지" placeholder="예: 일본 오사카" />
        <Input label="예산 (선택)" placeholder="₩0" inputMode="numeric" helper="공동 지출 기준이에요" />
      </div>
    </Screen>
  )
}

function LongList() {
  return (
    <Screen
      header={<TopHeader groupName="오사카 3박 4일" />}
      nav={<BottomNav phase="ended" active="second" aria-label="여정 메뉴 예시 긴 목록" />}
      cta={{ label: '정산 요청 보내기' }}
      gutter={false}
    >
      <ul className="divide-y divide-default bg-surface">
        {Array.from({ length: 20 }, (_, i) => (
          <li key={i} className="px-gutter py-4 text-body-m text-primary">
            거터 없는 행 {i + 1} — 행이 직접 좌우 20을 갖는다
          </li>
        ))}
      </ul>
    </Screen>
  )
}

export default defineCatalog({
  title: 'Screen',
  group: 'components',
  order: 60,
  Demo: function ScreenCatalog() {
    return (
      <Row>
        <Variant name="결제내역 탭 · 빈 화면 (header + nav)">
          <PhoneFrame>
            <PaymentsEmpty />
          </PhoneFrame>
        </Variant>
        <Variant name='서브 화면 + 하단 CTA · background="surface"'>
          <PhoneFrame>
            <CreateTrip />
          </PhoneFrame>
        </Variant>
        <Variant name="긴 목록 · gutter={false} · CTA + nav (스크롤해 보기)">
          <PhoneFrame>
            <LongList />
          </PhoneFrame>
        </Variant>
      </Row>
    )
  },
})
