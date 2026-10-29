import { useState } from 'react'
import { defineCatalog } from '../../catalog/catalog'
import { Row, Variant } from '../../catalog/ui'
import { Checkbox } from './Checkbox'

const LABEL = '[필수] 서비스 이용약관 동의'

function AllPick() {
  const [count, setCount] = useState(8)
  const total = 11
  return (
    <div className="flex items-center gap-4">
      <Checkbox
        label="전체 선택"
        checked={count === total}
        indeterminate={count > 0 && count < total}
        onChange={() => setCount(count === total ? 0 : total)}
      />
      <span className="text-body-s text-tertiary">{`${total}건 중 ${count}건`}</span>
      <button type="button" className="text-caption text-brand" onClick={() => setCount(8)}>
        일부로
      </button>
    </div>
  )
}

export default defineCatalog({
  title: 'Checkbox',
  figma: '24:8822',
  group: 'components',
  order: 5,
  Demo: function CheckboxCatalog() {
    return (
      <div className="flex flex-col gap-6">
        <Row>
          <Variant name="Checked=Off">
            <Checkbox label={LABEL} />
          </Variant>
          <Variant name="Checked=On">
            <Checkbox label={LABEL} defaultChecked />
          </Variant>
          <Variant name="Off · disabled">
            <Checkbox label={LABEL} disabled />
          </Variant>
          <Variant name="On · disabled">
            <Checkbox label={LABEL} defaultChecked disabled />
          </Variant>
        </Row>
        <Row>
          <Variant name="labelVisible={false} · Off">
            <Checkbox label={LABEL} labelVisible={false} />
          </Variant>
          <Variant name="labelVisible={false} · On">
            <Checkbox label={LABEL} labelVisible={false} defaultChecked />
          </Variant>
          <Variant name="labelVisible={false} · On · disabled">
            <Checkbox label={LABEL} labelVisible={false} defaultChecked disabled />
          </Variant>
        </Row>
        <Row>
          <Variant name="Checked=Indeterminate (v1.7 · indeterminate, aria-checked=mixed)">
            <Checkbox label={LABEL} indeterminate readOnly />
          </Variant>
          <Variant name="Indeterminate · disabled">
            <Checkbox label={LABEL} indeterminate disabled readOnly />
          </Variant>
          <Variant name="전체 선택(일부) — 눌러서 전체 ↔ 없음">
            <AllPick />
          </Variant>
        </Row>
      </div>
    )
  },
})
