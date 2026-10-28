import { useState } from 'react'
import { defineCatalog } from '../../catalog/catalog'
import { INITIAL, ME, MINJI } from '../../catalog/people'
import { Sub } from '../../catalog/ui'
import { TransferRow } from './TransferRow'

export default defineCatalog({
  title: 'TransferRow',
  figma: '24:8575',
  group: 'components',
  order: 29,
  Demo: function TransferRowCatalog() {
    const [copied, setCopied] = useState('')
    return (
      <div className="flex flex-col gap-6">
        <Sub title="송금 권장안 (복사 버튼은 숫자만 복사)">
          <div className="flex w-[390px] flex-col gap-3">
            <TransferRow from={INITIAL.seojun} to={INITIAL.minji} amount={48250} onCopyAmount={setCopied} />
            <TransferRow from={ME} to={MINJI} amount={112300} onCopyAmount={setCopied} />
          </div>
          <p className="text-caption text-tertiary">복사됨: {copied || '—'}</p>
        </Sub>
      </div>
    )
  },
})
