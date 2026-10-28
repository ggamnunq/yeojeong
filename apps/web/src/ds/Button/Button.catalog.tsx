import { defineCatalog } from '../../catalog/catalog'
import { Row, Sub, Variant } from '../../catalog/ui'
import { Button, type ButtonSize, type ButtonType } from './Button'

const TYPES: ButtonType[] = ['primary', 'secondary', 'ghost', 'danger']
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
          <Sub key={type} title={`type="${type}" · Pressed는 눌러서 확인`}>
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
