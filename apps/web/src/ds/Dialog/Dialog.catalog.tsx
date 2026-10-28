import { useState } from 'react'
import { defineCatalog } from '../../catalog/catalog'
import { Row, Sub, Variant } from '../../catalog/ui'
import { Button } from '../Button/Button'
import { Dialog, DialogPanel, type DialogType } from './Dialog'

const COPY = {
  default: {
    title: '여정을 종료할까요?',
    message: '종료하면 결제 내역 수집이 멈추고 정산 요약으로 넘어가요. 종료 후에는 다시 시작할 수 없어요.',
    confirmLabel: '종료하기',
  },
  danger: {
    title: '그룹을 삭제할까요?',
    message: '여정이 시작되기 전에만 삭제할 수 있어요. 초대된 그룹원 모두에게서 사라져요.',
    confirmLabel: '삭제하기',
  },
} as const

export default defineCatalog({
  title: 'Dialog',
  figma: '24:8719',
  group: 'components',
  order: 54,
  Demo: function DialogCatalog() {
    const [open, setOpen] = useState<DialogType | null>(null)
    const [last, setLast] = useState('—')
    const done = (what: string) => () => {
      setLast(`${open} → ${what}`)
      setOpen(null)
    }
    return (
      <div className="flex flex-col gap-8">
        <Sub title="겉모습 (DialogPanel) · Figma 세트처럼 bg/dim 위">
          <div className="flex flex-wrap items-start gap-8 rounded-md bg-dim p-6">
            <Variant name='type="default"'>
              <DialogPanel {...COPY.default} />
            </Variant>
            <Variant name='type="danger"'>
              <DialogPanel type="danger" {...COPY.danger} />
            </Variant>
            <Variant name='type="shared-to-personal" (문구 고정)'>
              <DialogPanel type="shared-to-personal" />
            </Variant>
          </div>
        </Sub>
        <Sub title="동작 · 버튼 콜백 · ESC = 취소 · 딤 탭으로는 닫히지 않음 · 처음 포커스는 취소">
          <Row className="items-center">
            <Button type="secondary" size="m" label="여정 종료" onClick={() => setOpen('default')} />
            <Button type="danger" size="m" label="그룹 삭제" onClick={() => setOpen('danger')} />
            <Button type="secondary" size="m" label="개인 결제로 바꾸기" onClick={() => setOpen('shared-to-personal')} />
            <output className="text-caption text-tertiary">마지막 선택: {last}</output>
          </Row>
          <Dialog
            open={open === 'default'}
            {...COPY.default}
            onCancel={done('취소')}
            onConfirm={done('확인')}
          />
          <Dialog open={open === 'danger'} type="danger" {...COPY.danger} onCancel={done('취소')} onConfirm={done('확인')} />
          <Dialog
            open={open === 'shared-to-personal'}
            type="shared-to-personal"
            onCancel={done('취소')}
            onConfirm={done('확인')}
          />
        </Sub>
      </div>
    )
  },
})
