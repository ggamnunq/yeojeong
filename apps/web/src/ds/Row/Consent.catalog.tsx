import { useState } from 'react'
import { defineCatalog } from '../../catalog/catalog'
import { Row, Variant } from '../../catalog/ui'
import { RowConsent } from './Consent'

const CHEVRON = { label: '금융정보 연동 약관 전문', href: '#row-consent' }

export default defineCatalog({
  title: 'Row/Consent',
  figma: '52:10120',
  group: 'components',
  order: 84,
  Demo: function RowConsentCatalog() {
    const [on, setOn] = useState(true)
    return (
      <div className="flex flex-col gap-6">
        <Row className="gap-5">
          <Variant name="Checked=On · Required=Yes" className="w-[350px]">
            <RowConsent title="금융정보 연동 약관" checked required chevron={CHEVRON} readOnly />
          </Variant>
          <Variant name="Checked=Off · Required=Yes" className="w-[350px]">
            <RowConsent title="금융정보 연동 약관" checked={false} required chevron={CHEVRON} readOnly />
          </Variant>
        </Row>
        <Row className="gap-5">
          <Variant name="Checked=On · Required=No" className="w-[350px]">
            <RowConsent title="금융정보 연동 약관" checked required={false} chevron={CHEVRON} readOnly />
          </Variant>
          <Variant name="Checked=Off · Required=No" className="w-[350px]">
            <RowConsent title="금융정보 연동 약관" checked={false} required={false} chevron={CHEVRON} readOnly />
          </Variant>
        </Row>
        <Row className="gap-5">
          <Variant name="눌러서 토글 · chevron 버튼(onClick)" className="w-[350px]">
            <RowConsent
              title="공동 결제 그룹 공개"
              checked={on}
              onChange={(e) => setOn(e.currentTarget.checked)}
              chevron={{ label: '공동 결제 그룹 공개 전문', onClick: () => {} }}
            />
          </Variant>
          <Variant name="Chevron 없음" className="w-[350px]">
            <RowConsent title="금융정보 수집·이용" checked readOnly />
          </Variant>
        </Row>
        <Row className="gap-5">
          <Variant name="v1.7 정렬 — 높이 52 · 15/0/15/20 · 글자 text/primary · › 오른쪽 끝" className="w-[350px]">
            <div data-figma="118:15461" className="w-full">
              <RowConsent title="카드 내역 조회 동의" checked={false} chevron={{ label: '카드 내역 조회 동의 전문', onClick: () => {} }} readOnly />
            </div>
          </Variant>
        </Row>
      </div>
    )
  },
})
