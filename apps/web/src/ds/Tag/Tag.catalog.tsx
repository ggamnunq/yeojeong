import { defineCatalog } from '../../catalog/catalog'
import { Row, Sub, Variant } from '../../catalog/ui'
import { Tag, type TagSize, type TagType } from './Tag'

const TYPES: TagType[] = ['shared', 'personal', 'pending', 'duplicate', 'refund', 'left', 'changed', 'warning']
const SIZES: TagSize[] = ['m', 's']

export default defineCatalog({
  title: 'Tag',
  figma: '24:7086',
  group: 'components',
  order: 9,
  Demo: function TagCatalog() {
    return (
      <div className="flex flex-col gap-4">
        {SIZES.map((size) => (
          <Row key={size}>
            {TYPES.map((type) => (
              <Variant key={type} name={`${type} · ${size}`}>
                <Tag type={type} size={size} />
              </Variant>
            ))}
          </Row>
        ))}
        <Sub title='v1.7 Label(Pending) — label="추가됨" · "취소됨" · "비슷한 기록"(Row/Pick chip)'>
          <Row>
            {(['미확정', '추가됨', '취소됨', '비슷한 기록'] as const).map((label) => (
              <Variant key={label} name={`pending · s · label="${label}"`}>
                <Tag type="pending" size="s" label={label} />
              </Variant>
            ))}
            <Variant name='pending · m · label="추가됨"'>
              <Tag type="pending" label="추가됨" />
            </Variant>
          </Row>
        </Sub>
      </div>
    )
  },
})
