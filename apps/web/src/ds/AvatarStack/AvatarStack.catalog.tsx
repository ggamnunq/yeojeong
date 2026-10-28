import { defineCatalog } from '../../catalog/catalog'
import { GROUP } from '../../catalog/people'
import { Row, Sub, Variant } from '../../catalog/ui'
import { AvatarStack, type AvatarStackSize } from './AvatarStack'

const SIZES: AvatarStackSize[] = ['xs', 's', 'm']
const COUNTS = [2, 3, 4, 6] // Figma Count=2/3/4/5+ (6명 → 4명 + "+2")

export default defineCatalog({
  title: 'AvatarStack',
  figma: '24:7268',
  group: 'components',
  order: 21,
  Demo: function AvatarStackCatalog() {
    return (
      <div className="flex flex-col gap-8">
        {SIZES.map((size) => (
          <Sub key={size} title={`size="${size}" · people 개수 = Count`}>
            <Row className="items-center">
              {COUNTS.map((n) => (
                <Variant key={n} name={n > 4 ? `${n}명 → Count=5+` : `Count=${n}`}>
                  <AvatarStack people={GROUP.slice(0, n)} size={size} />
                </Variant>
              ))}
            </Row>
          </Sub>
        ))}
        <Sub title="overflow={false} · 나간 멤버 섞임">
          <Row>
            <Variant name="6명 · overflow={false}">
              <AvatarStack people={GROUP} size="s" overflow={false} />
            </Variant>
            <Variant name="태현 left">
              <AvatarStack people={GROUP.slice(0, 3).map((p) => (p.name === '태현' ? { ...p, left: true } : p))} size="m" />
            </Variant>
          </Row>
        </Sub>
      </div>
    )
  },
})
