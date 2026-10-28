import { defineCatalog } from '../../catalog/catalog'
import { Row, Sub, Variant } from '../../catalog/ui'
import { IllustEmptyTrip, IllustLinked, IllustSettled } from './Illust'

export default defineCatalog({
  title: 'Illust',
  figma: '24:61381 · 24:61389 · 24:61395',
  group: 'components',
  order: 77,
  Demo: function IllustCatalog() {
    return (
      <div className="flex flex-col gap-8">
        <Sub title="140 원본 (Figma 크기)">
          <Row>
            <Variant name="IllustEmptyTrip · 결제 없음·여정 없음">
              <IllustEmptyTrip />
            </Variant>
            <Variant name="IllustLinked · 연동 완료">
              <IllustLinked />
            </Variant>
            <Variant name="IllustSettled · 정산 완료·연결 결과">
              <IllustSettled />
            </Variant>
          </Row>
        </Sub>
        <Sub title="size 120 · 160 (쓰는 범위)">
          <Row>
            <Variant name="size={120}">
              <IllustEmptyTrip size={120} />
            </Variant>
            <Variant name="size={160}">
              <IllustSettled size={160} />
            </Variant>
          </Row>
        </Sub>
      </div>
    )
  },
})
