import { defineCatalog } from '../../catalog/catalog'
import { Row, Sub, Variant } from '../../catalog/ui'
import { Icon } from './Icon'
import { ICON_NAMES } from './icons'
import { KakaoSymbol } from './KakaoSymbol'

export default defineCatalog({
  title: 'Icon',
  figma: 'Icon/* 24:3872~ · Brand/KakaoSymbol 24:4077',
  group: 'foundations',
  order: 4,
  Demo: function IconCatalog() {
    return (
      <div className="flex flex-col gap-8">
        <Sub title={`Figma 이름 ${ICON_NAMES.length}종 · 24px · text-icon-default`}>
          <div data-icon-grid className="grid w-fit grid-cols-11 gap-x-2 gap-y-4 text-icon-default">
            {ICON_NAMES.map((name) => (
              <div key={name} className="flex w-[120px] flex-col items-start gap-1.5">
                <Icon name={name} size={24} />
                <span className="text-caption text-tertiary">{name}</span>
              </div>
            ))}
          </div>
        </Sub>
        <Sub title="크기 16 · 20 · 24 / 색 토큰">
          <Row className="items-end">
            {([16, 20, 24] as const).map((size) => (
              <Variant key={size} name={`size={${size}}`}>
                <Icon name="wallet" size={size} className="text-icon-default" />
              </Variant>
            ))}
            <Variant name="icon-subtle">
              <Icon name="wallet" className="text-icon-subtle" />
            </Variant>
            <Variant name="icon-brand">
              <Icon name="wallet" className="text-icon-brand" />
            </Variant>
            <Variant name="icon-disabled">
              <Icon name="wallet" className="text-icon-disabled" />
            </Variant>
            <Variant name="KakaoSymbol 24 · 20">
              <div className="flex items-center gap-3">
                <KakaoSymbol size={24} />
                <KakaoSymbol size={20} />
              </div>
            </Variant>
          </Row>
        </Sub>
      </div>
    )
  },
})
