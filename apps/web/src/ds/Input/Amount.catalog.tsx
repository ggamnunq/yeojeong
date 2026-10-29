import { useState } from 'react'
import { defineCatalog } from '../../catalog/catalog'
import { Row, Variant } from '../../catalog/ui'
import { formatKrw } from '../format'
import { InputAmount } from './Amount'
import { amountInputNumber } from './rules'

// 오사카 샘플 환율 100엔 = 919.20원
const toKrw = (jpy: number) => Math.round((jpy * 919.2) / 100)

function Live() {
  const [value, setValue] = useState('1200')
  const [currency, setCurrency] = useState<'JPY' | 'KRW'>('JPY')
  const jpy = currency === 'JPY'
  const n = amountInputNumber(value)
  return (
    <InputAmount
      value={value}
      onChange={setValue}
      symbol={jpy ? '¥' : '₩'}
      currency={{ label: currency, onClick: () => setCurrency(jpy ? 'KRW' : 'JPY') }}
      converted={jpy && n > 0 ? `≈ ${formatKrw(toKrw(n))}` : undefined}
    />
  )
}

export default defineCatalog({
  title: 'Input/Amount',
  figma: '77:10549',
  group: 'components',
  order: 89,
  Demo: function InputAmountCatalog() {
    return (
      <Row>
        <Variant name="HF-46 · ¥1,200 + JPY 칩 + 환산 줄 (입력·칩 눌러 KRW ↔ JPY)">
          <div className="w-[350px]">
            <Live />
          </div>
        </Variant>
        <Variant name='빈 값 · placeholder "0" (text/disabled)'>
          <div className="w-[350px]">
            <InputAmount value="" symbol="¥" currency={{ label: 'JPY', onClick: () => {} }} />
          </div>
        </Variant>
        <Variant name="KRW 여정 · 칩 고정(onClick 없음) · 환산 줄 없음">
          <div className="w-[350px]">
            <InputAmount value="25000" symbol="₩" currency={{ label: 'KRW' }} />
          </div>
        </Variant>
        <Variant name="USD · fractionDigits={2} · disabled(잠금)">
          <div className="w-[350px]">
            <InputAmount value="12.5" symbol="$" fractionDigits={2} currency={{ label: 'USD', onClick: () => {} }} converted="≈ ₩17,210" disabled />
          </div>
        </Variant>
      </Row>
    )
  },
})
