import { useState, type ReactNode } from 'react'
import { defineCatalog } from '../../catalog/catalog'
import { PhoneFrame } from '../../catalog/PhoneFrame'
import { Row, Sub, Variant } from '../../catalog/ui'
import { BottomNav } from '../BottomNav/BottomNav'
import { Button } from '../Button/Button'
import { Screen } from '../Screen/Screen'
import { SegmentedControl } from '../SegmentedControl/SegmentedControl'
import { TopHeader } from '../TopHeader/TopHeader'
import { BottomSheet, BottomSheetPanel } from './BottomSheet'

// Figma Slot/Placeholder(24:8645) 모양. 실제 화면에서는 내용 컴포넌트가 들어간다.
const Placeholder = () => (
  <div className="flex items-center justify-center rounded-md border border-default bg-brand-subtle py-12 text-caption text-brand">
    Content 슬롯 — 컴포넌트로 만든 내용을 Instance swap
  </div>
)

// 2단계 SheetContent/PaymentDetail 자리에 두는 단순한 예시 내용
function PaymentSummary() {
  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-1">
        <p className="text-body-m text-secondary">패밀리마트 난바역점</p>
        <p className="font-amount text-amount-l text-primary">₩11,770</p>
        <p className="text-caption text-tertiary">¥1,280 · 100엔 = 919.20원 · 11.13 08:50 · 내 결제</p>
      </div>
      <SegmentedControl labels={['개인', '공동']} aria-label="결제 구분" />
    </div>
  )
}

function OpenButton({ label, children }: { label: string; children: (close: () => void) => ReactNode }) {
  const [open, setOpen] = useState(false)
  return (
    <>
      <Button type="secondary" size="m" label={label} onClick={() => setOpen(true)} />
      {open && children(() => setOpen(false))}
    </>
  )
}

export default defineCatalog({
  title: 'BottomSheet',
  figma: '24:8647',
  group: 'components',
  order: 53,
  Demo: function BottomSheetCatalog() {
    const [sheet, setSheet] = useState<'detail' | 'long' | 'plain' | null>(null)
    const close = () => setSheet(null)
    return (
      <div className="flex flex-col gap-8">
        <Sub title="겉모습 (BottomSheetPanel) · 아래 패딩은 24 + 안전영역(데스크톱 0, 아이폰 34)">
          <Row>
            <Variant name="title · close · cta (Figma 기본)">
              <div className="w-[390px]">
                <BottomSheetPanel title="결제 상세" cta={{ label: '저장하기' }}>
                  <Placeholder />
                </BottomSheetPanel>
              </div>
            </Variant>
            <Variant name="cta 없음">
              <div className="w-[390px]">
                <BottomSheetPanel title="그룹 목록">
                  <Placeholder />
                </BottomSheetPanel>
              </div>
            </Variant>
            <Variant name="close={false}">
              <div className="w-[390px]">
                <BottomSheetPanel title="초대코드 공유" close={false} cta={{ label: '코드 복사' }}>
                  <Placeholder />
                </BottomSheetPanel>
              </div>
            </Variant>
          </Row>
        </Sub>

        <Sub title='DS18 헤더 · leading="back"(시트 안 단계, ✕ 기본 숨김) · action(제목 오른쪽 텍스트 버튼)'>
          <Row>
            <Variant name='leading="back" · onBack (HF-47 나누기)'>
              <div className="w-[390px]">
                <BottomSheetPanel title="나누기" leading="back" cta={{ label: '완료' }}>
                  <Placeholder />
                </BottomSheetPanel>
              </div>
            </Variant>
            <Variant name='action={{ label: "수정" }} (HF-20b)'>
              <div className="w-[390px]">
                <BottomSheetPanel title="타코야키" action={{ label: '수정' }} cta={{ label: '저장', state: 'disabled' }}>
                  <PaymentSummary />
                </BottomSheetPanel>
              </div>
            </Variant>
            <Variant name='leading="back" · close · action="완료"'>
              <div className="w-[390px]">
                <BottomSheetPanel title="여정" leading="back" close action={{ label: '완료' }}>
                  <Placeholder />
                </BottomSheetPanel>
              </div>
            </Variant>
          </Row>
        </Sub>

        <Sub title="열린 상태 (화면 위 · bg/dim)">
          <PhoneFrame
            overlay={
              <>
                <div className="absolute inset-0 bg-dim" />
                <div className="absolute inset-x-0 bottom-0">
                  <BottomSheetPanel title="결제 상세" cta={{ label: '개인으로 확정' }}>
                    <PaymentSummary />
                  </BottomSheetPanel>
                </div>
              </>
            }
          >
            <Screen
              header={<TopHeader groupName="오사카 3박 4일" />}
              nav={<BottomNav aria-label="여정 메뉴 예시 시트 배경" />}
            >
              <p className="pt-6 text-body-m text-secondary">결제 내역 화면</p>
            </Screen>
          </PhoneFrame>
        </Sub>

        <Sub title="동작 · 열어서 ESC · 딤 탭 · 닫기 · Tab 순환 확인 (모션 200ms, 동작 줄이기 설정이면 없음)">
          <Row>
            <Button type="secondary" size="m" label="결제 상세 열기" onClick={() => setSheet('detail')} />
            <Button type="secondary" size="m" label="긴 내용 열기" onClick={() => setSheet('long')} />
            <Button type="secondary" size="m" label="CTA 없이 열기" onClick={() => setSheet('plain')} />
            <OpenButton label="열 때만 그리기">
              {(onClose) => (
                <BottomSheet open title="조건부로 그린 시트" onClose={onClose} cta={{ label: '확인', onClick: onClose }}>
                  <p className="text-body-m text-secondary">open일 때만 마운트해도 같은 동작이다(닫힘 애니메이션은 없음).</p>
                </BottomSheet>
              )}
            </OpenButton>
          </Row>
          <BottomSheet open={sheet === 'detail'} onClose={close} title="결제 상세" cta={{ label: '개인으로 확정', onClick: close }}>
            <PaymentSummary />
          </BottomSheet>
          <BottomSheet open={sheet === 'long'} onClose={close} title="이용 약관" cta={{ label: '동의하기', onClick: close }}>
            <div className="flex flex-col gap-3 text-body-m text-secondary">
              {Array.from({ length: 24 }, (_, i) => (
                <p key={i}>
                  제{i + 1}조 · 내용이 시트 높이를 넘으면 제목과 CTA는 고정되고 이 부분만 스크롤된다.
                </p>
              ))}
            </div>
          </BottomSheet>
          <BottomSheet open={sheet === 'plain'} onClose={close} title="그룹 목록">
            <div className="flex flex-col gap-2">
              <Button type="ghost" size="m" label="오사카 3박 4일" onClick={close} />
              <Button type="ghost" size="m" label="제주 2박 3일" onClick={close} />
            </div>
          </BottomSheet>
        </Sub>
      </div>
    )
  },
})
