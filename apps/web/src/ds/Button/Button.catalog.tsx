import { defineCatalog } from '../../catalog/catalog'
import { Row, Sub, Variant } from '../../catalog/ui'
import { Button, type ButtonSize, type ButtonType } from './Button'

// danger-weak = Figma Style=Danger-weak(DS17): 옅은 에러 면 + 에러 글자, 하단 2버튼 왼쪽의 파괴적 보조
const TYPES: ButtonType[] = ['primary', 'secondary', 'ghost', 'danger', 'danger-weak']
const SIZES: ButtonSize[] = ['l', 'm', 's']

export default defineCatalog({
  title: 'Button',
  figma: '24:6232',
  group: 'components',
  order: 1,
  Demo: function ButtonCatalog() {
    return (
      <div className="flex flex-col gap-8">
        {TYPES.map((type) => (
          <Sub key={type} title={`type="${type}" · Pressed는 눌러서 확인 · Loading(v1.5)은 라벨 투명 + 스피너`}>
            {SIZES.map((size) => (
              <Row key={size}>
                <Variant name={`size="${size}"`}>
                  <Button type={type} size={size} label="여정 시작하기" />
                </Variant>
                <Variant name="disabled">
                  <Button type={type} size={size} label="여정 시작하기" disabled />
                </Variant>
                <Variant name="leadingIcon">
                  <Button type={type} size={size} label="여정 시작하기" leadingIcon icon="airplane" />
                </Variant>
                <Variant name="leadingIcon · disabled">
                  <Button type={type} size={size} label="여정 시작하기" leadingIcon disabled />
                </Variant>
                <Variant name='state="loading"'>
                  <Button type={type} size={size} label="여정 시작하기" state="loading" />
                </Variant>
              </Row>
            ))}
          </Sub>
        ))}
        <Sub title="하단 CTA (w-full)">
          <div className="w-[350px]">
            <Button label="여정 시작" className="w-full" />
          </div>
        </Sub>
      </div>
    )
  },
})
