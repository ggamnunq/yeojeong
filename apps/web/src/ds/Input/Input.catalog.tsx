import { useState } from 'react'
import { defineCatalog } from '../../catalog/catalog'
import { Row, Sub, Variant } from '../../catalog/ui'
import { Input } from './Input'
import { InputPicker } from './Picker'

// v1.6.1: 헬퍼 텍스트는 기본 숨김 — 오류 문구만 쓴다(설명형 헬퍼 없음)
export default defineCatalog({
  title: 'Input',
  figma: '24:6970',
  group: 'components',
  order: 4,
  Demo: function InputCatalog() {
    const [name, setName] = useState('오사카 우정여행')
    const [nick, setNick] = useState('준용')
    const [budget, setBudget] = useState('1,200,000')
    const [opened, setOpened] = useState(0)
    return (
      <div className="flex flex-col gap-8">
        <Sub title='Type=Text · size="m"'>
          <Row>
            <Variant name="default (placeholder)" className="w-[350px]">
              <Input label="그룹명" placeholder="예) 오사카 우정여행" className="w-full" />
            </Variant>
            <Variant name="onClear · 눌러서 Focus 확인" className="w-[350px]">
              <Input label="그룹명" value={name} onChange={(e) => setName(e.target.value)} onClear={() => setName('')} className="w-full" />
            </Variant>
            <Variant name="error (오류 문구만)" className="w-[350px]">
              <Input label="그룹명" defaultValue="오사카 우정여행" error helper="그룹명을 입력해 주세요 (최대 20자)" className="w-full" />
            </Variant>
            <Variant name="disabled" className="w-[350px]">
              <Input label="그룹명" defaultValue="오사카 우정여행" disabled className="w-full" />
            </Variant>
          </Row>
        </Sub>
        <Sub title="Suffix · Trailing icon (v1.6)">
          <Row>
            <Variant name='suffix (Suffix text "원") · 예산' className="w-[350px]">
              <Input label="예산" inputMode="numeric" value={budget} onChange={(e) => setBudget(e.target.value)} suffix className="w-full" />
            </Variant>
            <Variant name='suffix · placeholder' className="w-[350px]">
              <Input label="예산" inputMode="numeric" placeholder="0" suffix className="w-full" />
            </Variant>
            <Variant name="suffix · error" className="w-[350px]">
              <Input label="예산" defaultValue="0" suffix error helper="1원 이상 입력해 주세요" className="w-full" />
            </Variant>
            <Variant name='trailingIcon · icon="marker"' className="w-[350px]">
              <Input label="장소" placeholder="도시 검색" trailingIcon icon="marker" className="w-full" />
            </Variant>
            <Variant name="trailingIcon (기본 calendar) · disabled" className="w-[350px]">
              <Input label="출발일" defaultValue="2026.11.12" trailingIcon disabled className="w-full" />
            </Variant>
          </Row>
        </Sub>
        <Sub title="Type=Picker — InputPicker (v1.6 · 읽기 전용 값 + ⌄, 누르면 시트)">
          <Row>
            <Variant name="Default · placeholder" className="w-[350px]">
              <InputPicker label="기간" placeholder="출발일 – 도착일" onClick={() => setOpened((n) => n + 1)} className="w-full" />
            </Variant>
            <Variant name="Default · 값 · 눌러서 Focus 확인" className="w-[350px]">
              <InputPicker
                label="기간"
                placeholder="출발일 – 도착일"
                value="11.12 (목) – 11.15 (일)"
                onClick={() => setOpened((n) => n + 1)}
                className="w-full"
              />
            </Variant>
            <Variant name="Error" className="w-[350px]">
              <InputPicker label="기간" placeholder="출발일 – 도착일" value="11.12 (목) – 11.15 (일)" error helper="도착일을 선택해 주세요" className="w-full" />
            </Variant>
            <Variant name="Disabled" className="w-[350px]">
              <InputPicker label="기간" placeholder="출발일 – 도착일" value="11.12 (목) – 11.15 (일)" disabled className="w-full" />
            </Variant>
            <Variant name='장소 · trailingIcon icon="marker"' className="w-[350px]">
              <InputPicker label="장소" placeholder="도시 검색" trailingIcon icon="marker" className="w-full" />
            </Variant>
            <Variant name={`열린 횟수: ${opened}`}>
              <span />
            </Variant>
          </Row>
        </Sub>
        <Sub title='size="l" (온보딩 큰 입력 · 필드 60 · 값 H3)'>
          <Row>
            <Variant name='size="l"' className="w-[350px]">
              <Input size="l" label="그룹명" placeholder="예) 오사카 우정여행" className="w-full" />
            </Variant>
            <Variant name='size="l" · labelVisible={false} · onClear (HF-03)' className="w-[350px]">
              <Input
                size="l"
                labelVisible={false}
                label="닉네임"
                value={nick}
                onChange={(e) => setNick(e.target.value)}
                onClear={() => setNick('')}
                className="w-full"
              />
            </Variant>
            <Variant name='size="l" · error' className="w-[350px]">
              <Input size="l" labelVisible={false} label="닉네임" defaultValue="준" error helper="2자 이상 입력해 주세요" className="w-full" />
            </Variant>
            <Variant name='size="l" · disabled' className="w-[350px]">
              <Input size="l" label="그룹명" defaultValue="오사카 우정여행" disabled className="w-full" />
            </Variant>
          </Row>
        </Sub>
      </div>
    )
  },
})
