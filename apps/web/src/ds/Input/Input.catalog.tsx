import { useState } from 'react'
import { defineCatalog } from '../../catalog/catalog'
import { Row, Variant } from '../../catalog/ui'
import { Input } from './Input'

export default defineCatalog({
  title: 'Input',
  figma: '24:6970',
  group: 'components',
  order: 4,
  Demo: function InputCatalog() {
    const [name, setName] = useState('오사카 우정여행')
    return (
      <Row>
        <Variant name="default (placeholder)" className="w-[350px]">
          <Input label="그룹명" placeholder="예) 오사카 우정여행" helper="여정 목록과 헤더에 보이는 이름이에요" className="w-full" />
        </Variant>
        <Variant name="onClear · 눌러서 Focus 확인" className="w-[350px]">
          <Input
            label="그룹명"
            value={name}
            onChange={(e) => setName(e.target.value)}
            onClear={() => setName('')}
            helper="여정 목록과 헤더에 보이는 이름이에요"
            className="w-full"
          />
        </Variant>
        <Variant name="error" className="w-[350px]">
          <Input label="그룹명" defaultValue="오사카 우정여행" error helper="그룹명을 입력해 주세요 (최대 20자)" className="w-full" />
        </Variant>
        <Variant name="disabled" className="w-[350px]">
          <Input label="그룹명" defaultValue="오사카 우정여행" disabled helper="여정 목록과 헤더에 보이는 이름이에요" className="w-full" />
        </Variant>
        <Variant name="helper 없음" className="w-[350px]">
          <Input label="닉네임" placeholder="2~10자" className="w-full" />
        </Variant>
      </Row>
    )
  },
})
