import { useState, type ReactNode } from 'react'
import {
  BottomSheet,
  Button,
  DateHeader,
  formatKrw,
  formatMoney,
  InputAmount,
  PaymentRow,
  RowAdd,
  RowField,
  RowFieldInput,
  RowFieldToggle,
  SheetContentOption,
  SheetContentSplitPick,
  ShellSub,
  splitPickSummary,
  walletMeta,
  type SplitPickMember,
} from '../ds'
import { BottomSheetPanel } from '../ds/BottomSheet/BottomSheet'
import { defineCatalog } from './catalog'
import { ME, MINJI, SUBIN, TAEHYUN } from './people'
import { PhoneFrame } from './PhoneFrame'
import { Row, Sub, Variant } from './ui'

// DS18 조합 예시: 수동 결제(화면명세 K절 · HF-46~50 · 20b) 시트를 DS 부품만으로 조립한다.
// Figma Form/ManualPayment(77:10549)는 06 로컬 조합이라 코드 컴포넌트를 따로 두지 않는다 — 화면이 아래 순서로 조립한다:
// InputAmount(pb 16) → RowFieldInput "내용" → RowField 결제자·나누기·날짜(·여정) → RowFieldToggle "내 지갑에도 기록".

const MEMBERS: SplitPickMember[] = [
  { ...ME, id: 'me' },
  { ...MINJI, id: 'minji' },
  { ...TAEHYUN, id: 'taehyun' },
  { ...SUBIN, id: 'subin' },
]
const KRW = 11030

function Amount({ value = '1200' }: { value?: string }) {
  return (
    <InputAmount
      className="pb-4"
      value={value}
      symbol="¥"
      currency={{ label: 'JPY', onClick: () => {} }}
      converted={value ? `≈ ${formatKrw(KRW)}` : undefined}
      readOnly
    />
  )
}

function Sheet({ children }: { children: ReactNode }) {
  return (
    <PhoneFrame
      overlay={
        <>
          <div className="absolute inset-0 bg-dim" />
          <div className="absolute inset-x-0 bottom-0">{children}</div>
        </>
      }
    >
      <div className="h-full bg-surface" />
    </PhoneFrame>
  )
}

// HF-46: 여정 결제 추가
function TripForm({ memo = '', date = '지금' }: { memo?: string; date?: string }) {
  return (
    <div className="flex flex-col">
      <Amount />
      <RowFieldInput label="내용" placeholder="예) 저녁" maxLength={40} value={memo} readOnly />
      <RowField label="결제자" avatar={ME} value="나" />
      <RowField label="나누기" stack={MEMBERS} />
      <RowField label="날짜" value={date} />
      <RowFieldToggle label="내 지갑에도 기록" value />
    </div>
  )
}

// 같은 시트 안에서 폼 ↔ 나누기 ↔ 결제자 단계를 오가는 동작 예시
function LiveTripSheet() {
  const [open, setOpen] = useState(false)
  const [step, setStep] = useState<'form' | 'split' | 'payer'>('form')
  const [split, setSplit] = useState(['me', 'minji', 'taehyun', 'subin'])
  const [draft, setDraft] = useState(split)
  const [payer, setPayer] = useState('me')
  const [amount, setAmount] = useState('')
  const [jpy, setJpy] = useState(true)
  const [memo, setMemo] = useState('')
  const [wallet, setWallet] = useState(false)
  const krw = Math.round(((Number(amount) || 0) * (jpy ? 919.2 : 100)) / 100)
  const people = MEMBERS.filter((m) => split.includes(m.id))
  const payerPerson = MEMBERS.find((m) => m.id === payer) ?? MEMBERS[0]
  const onlyPayer = (ids: readonly string[]) => ids.length === 1 && ids[0] === payer
  const summary = splitPickSummary(krw, draft.length)
  const close = () => {
    setOpen(false)
    setStep('form')
  }

  return (
    <>
      <Button type="secondary" size="m" label="결제 내역 추가 시트 열기" onClick={() => setOpen(true)} />
      <BottomSheet
        open={open}
        onClose={close}
        title={step === 'form' ? '결제 내역 추가' : step === 'split' ? '나누기' : '결제자'}
        leading={step === 'form' ? 'none' : 'back'}
        onBack={() => setStep('form')}
        cta={
          step === 'form'
            ? { label: '추가', state: Number(amount) > 0 ? 'default' : 'disabled', onClick: close }
            : step === 'split'
              ? {
                  label: '완료',
                  state: draft.length === 0 || (payer !== 'me' && onlyPayer(draft)) ? 'disabled' : 'default',
                  onClick: () => {
                    setSplit(draft)
                    setStep('form')
                  },
                }
              : undefined
        }
      >
        {step === 'form' && (
          <div className="flex flex-col">
            <InputAmount
              className="pb-4"
              autoFocus
              value={amount}
              onChange={setAmount}
              symbol={jpy ? '¥' : '₩'}
              currency={{ label: jpy ? 'JPY' : 'KRW', onClick: () => setJpy(!jpy) }}
              converted={jpy && krw > 0 ? `≈ ${formatKrw(krw)}` : undefined}
            />
            <RowFieldInput label="내용" placeholder="예) 저녁" maxLength={40} value={memo} onChange={(e) => setMemo(e.target.value)} />
            <RowField
              label="결제자"
              avatar={payerPerson}
              value={payerPerson.me ? '나' : payerPerson.name}
              onClick={() => setStep('payer')}
            />
            <RowField
              label="나누기"
              stack={onlyPayer(split) && payer === 'me' ? undefined : people}
              personal={onlyPayer(split) && payer === 'me'}
              onClick={() => {
                setDraft(split)
                setStep('split')
              }}
            />
            <RowField label="날짜" value="지금" />
            {payer === 'me' && <RowFieldToggle label="내 지갑에도 기록" value={wallet} onChange={setWallet} />}
          </div>
        )}
        {step === 'split' && (
          <SheetContentSplitPick
            members={MEMBERS}
            selected={draft}
            onChange={setDraft}
            personal={draft.length === 1 && draft[0] === 'me' && payer === 'me'}
            perPerson={summary.perPerson}
            remainder={summary.remainder}
          />
        )}
        {step === 'payer' && (
          <SheetContentSplitPick
            mode="single"
            members={MEMBERS}
            selected={payer}
            onChange={(id) => {
              setPayer(id)
              setStep('form')
            }}
          />
        )}
      </BottomSheet>
    </>
  )
}

export default defineCatalog({
  title: 'Pattern/ManualPayment',
  figma: '77:10549',
  group: 'components',
  order: 90,
  Demo: function ManualPaymentCatalog() {
    const split3 = splitPickSummary(KRW, 3)
    return (
      <div className="flex flex-col gap-8">
        <Sub title="동작 · 결제 추가 → 결제자/나누기 단계(‹ 로 복귀) · 통화 칩 · 지갑 토글(결제자 = 나일 때만)">
          <Row>
            <LiveTripSheet />
          </Row>
        </Sub>
        <Sub title="HF-46 · 47 · 47b · 50 (여정)">
          <Row>
            <Variant name="HF-46 결제 추가">
              <Sheet>
                <BottomSheetPanel title="결제 내역 추가" cta={{ label: '추가' }}>
                  <TripForm />
                </BottomSheetPanel>
              </Sheet>
            </Variant>
            <Variant name='HF-47 나누기 · leading="back"'>
              <Sheet>
                <BottomSheetPanel title="나누기" leading="back" cta={{ label: '완료' }}>
                  <SheetContentSplitPick
                    members={MEMBERS}
                    selected={['me', 'minji', 'taehyun']}
                    perPerson={split3.perPerson}
                    remainder={split3.remainder}
                  />
                </BottomSheetPanel>
              </Sheet>
            </Variant>
            <Variant name="HF-47b 나만 = 개인">
              <Sheet>
                <BottomSheetPanel title="나누기" leading="back" cta={{ label: '완료' }}>
                  <SheetContentSplitPick members={MEMBERS} selected={['me']} personal />
                </BottomSheetPanel>
              </Sheet>
            </Variant>
            <Variant name="HF-50 결제 수정 · 가로 2버튼">
              <Sheet>
                <BottomSheetPanel
                  title="결제 수정"
                  cta={{ layout: 'horizontal', secondary: { label: '삭제', type: 'danger-weak' }, primary: { label: '저장' } }}
                >
                  <TripForm memo="타코야키" date="11.13 15:20" />
                </BottomSheetPanel>
              </Sheet>
            </Variant>
          </Row>
        </Sub>
        <Sub title="HF-48 · 48b (지갑) · HF-20b 헤더 action">
          <Row>
            <Variant name="HF-48 지갑 결제 추가">
              <Sheet>
                <BottomSheetPanel title="결제 내역 추가" cta={{ label: '추가' }}>
                  <div className="flex flex-col">
                    <Amount />
                    <RowFieldInput label="내용" placeholder="예) 저녁" readOnly value="" />
                    <RowField label="날짜" value="지금" />
                    <RowField label="여정" value="오사카 3박 4일" />
                  </div>
                </BottomSheetPanel>
              </Sheet>
            </Variant>
            <Variant name='HF-48b 여정 선택 · leading="back" · SheetContentOption logo={false}'>
              <Sheet>
                <BottomSheetPanel title="여정" leading="back">
                  <SheetContentOption
                    value="osaka"
                    options={[
                      { value: 'osaka', logo: false, title: '오사카 3박 4일', subtitle: '진행 중 · 11.12 – 11.15' },
                      { value: 'busan', logo: false, title: '부산 연말 모임', subtitle: '시작 전 · 12.27 – 12.29' },
                      { value: 'none', logo: false, title: '추가 안 함' },
                    ]}
                  />
                </BottomSheetPanel>
              </Sheet>
            </Variant>
            <Variant name='HF-20b 헤더 action="수정"'>
              <Sheet>
                <BottomSheetPanel title="타코야키" action={{ label: '수정' }} cta={{ label: '저장', state: 'disabled' }}>
                  <div className="flex flex-col gap-0.5">
                    <p className="font-amount text-amount-xl text-primary">{formatKrw(KRW)}</p>
                    <p className="text-caption text-tertiary">¥1,200 · 11.13 15:20</p>
                  </div>
                </BottomSheetPanel>
              </Sheet>
            </Variant>
            <Variant name='HF-49 내 지갑 · PaymentRow leading="none" · DateHeader Day 끔'>
              <PhoneFrame>
                <ShellSub header={{ title: '내 지갑' }} gutter={false}>
                  <div className="flex flex-col gap-1 px-gutter">
                    <p className="text-body-s-strong text-secondary">이번 달</p>
                    <p className="font-amount text-amount-xl text-primary">{formatKrw(412350)}</p>
                  </div>
                  <RowAdd label="결제 내역 추가" className="mt-4" />
                  <div className="h-1" />
                  <DateHeader style="plain" date="11.13 (금)" className="bg-surface" />
                  {[
                    ['551 호라이 난바본점', '18:20', 25740, 2800],
                    ['MK택시', '14:10', 26290, 2860],
                    ['패밀리마트 난바역점', '08:50', 11770, 1280],
                  ].map(([merchant, time, krw, jpy]) => (
                    <PaymentRow
                      key={merchant}
                      leading="none"
                      merchant={merchant}
                      meta={walletMeta(time as string, '오사카 3박 4일')}
                      amount={krw as number}
                      originalAmount={formatMoney(jpy as number, 'JPY')}
                    />
                  ))}
                  <div className="h-4" />
                  <DateHeader style="plain" date="11.12 (목)" className="bg-surface" />
                  <PaymentRow
                    leading="none"
                    merchant="돈키호테 도톤보리점"
                    meta={walletMeta('17:40', '오사카 3박 4일')}
                    amount={79420}
                    originalAmount={formatMoney(8640, 'JPY')}
                  />
                </ShellSub>
              </PhoneFrame>
            </Variant>
          </Row>
        </Sub>
      </div>
    )
  },
})
