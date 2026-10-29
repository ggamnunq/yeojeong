import { useState } from 'react'
import { defineCatalog } from '../../catalog/catalog'
import { GROUP, ME, MINJI } from '../../catalog/people'
import { Row, Variant } from '../../catalog/ui'
import { RowField, RowFieldInput, RowFieldToggle } from './Field'

export default defineCatalog({
  title: 'Row/Field',
  figma: '77:10504',
  group: 'components',
  order: 87,
  Demo: function RowFieldCatalog() {
    const [memo, setMemo] = useState('')
    const [wallet, setWallet] = useState(true)
    return (
      <Row>
        <Variant name="HF-46 폼 행 (폭 350 · 높이 52 · 행 사이 선 없음)">
          <div className="flex w-[350px] flex-col">
            <RowFieldInput label="내용" placeholder="예) 저녁" maxLength={40} value={memo} onChange={(e) => setMemo(e.target.value)} />
            <RowField label="결제자" avatar={ME} value="나" />
            <RowField label="나누기" stack={GROUP.slice(0, 4)} />
            <RowField label="날짜" value="지금" />
            <RowFieldToggle label="내 지갑에도 기록" value={wallet} onChange={setWallet} />
          </div>
        </Variant>
        <Variant name="값 변형 · placeholder · 개인 · +N · 말줄임 · disabled">
          <div className="flex w-[350px] flex-col">
            <RowField label="결제자" avatar={MINJI} value="민지" />
            <RowField label="나누기" personal />
            <RowField label="나누기" stack={GROUP} />
            <RowField label="날짜" value="11.13 15:20" />
            <RowField label="여정" value="오사카 3박 4일 · 간사이 먹방 대장정 특별편" />
            <RowField label="여정" placeholder="추가 안 함" />
            <RowField label="결제자" avatar={ME} value="나" disabled />
            <RowFieldInput label="내용" value="타코야키" disabled readOnly />
            <RowFieldToggle label="내 지갑에도 기록" value={false} disabled />
          </div>
        </Variant>
      </Row>
    )
  },
})
