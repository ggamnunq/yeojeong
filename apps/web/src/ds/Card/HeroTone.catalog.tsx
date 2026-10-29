import { defineCatalog } from '../../catalog/catalog'
import { MINJI } from '../../catalog/people'
import { Row, Variant } from '../../catalog/ui'
import { Avatar } from '../Avatar/Avatar'
import { CardHeroTone } from './HeroTone'

const ROUTE = { start: '11.12 (목)', end: '11.15 (일)' }
const META = '일본 오사카 · 3박 4일 · 예산 ₩1,200,000'

export default defineCatalog({
  title: 'Card/HeroTone',
  figma: '52:10212',
  group: 'components',
  order: 28,
  Demo: function CardHeroToneCatalog() {
    return (
      <div className="flex flex-col gap-8">
        <Row className="gap-8">
          <Variant name="Figma 기본 · action · route(upcoming) · meta (HF-16 시작 전)" className="w-[350px]">
            <CardHeroTone
              label="출발까지"
              hero="D-15"
              action={{ label: '여정 정보 수정', onClick: () => {} }}
              route={{ phase: 'upcoming', ...ROUTE }}
              meta={META}
            />
          </Variant>
          <Variant name="진행 중 · heroSuffix · route(ongoing) · action text(W9 「수정」 Ghost S)" className="w-[350px]">
            <CardHeroTone
              label="여행 중"
              hero="Day 2"
              heroSuffix="/ 4"
              action={{ label: '여정 정보 수정', text: '수정', onClick: () => {} }}
              route={{ phase: 'ongoing', ...ROUTE, days: 4, current: 2 }}
              meta={META}
            />
          </Variant>
        </Row>
        <Row className="gap-8">
          <Variant name="정산(HF-25) · sub · route(ended) · meta 없음" className="w-[350px]">
            <CardHeroTone
              label="총 공동 지출"
              hero="₩826,910"
              sub={
                <span className="flex items-center gap-1.5">
                  N빵 1인 <span className="text-body-s-strong text-primary">₩206,728</span>
                </span>
              }
              route={{ phase: 'ended', ...ROUTE }}
            />
          </Variant>
          <Variant name="멤버별 내역(HF-26) · aside(프사 L) · 색 바꾼 hero · sub" className="w-[350px]">
            <CardHeroTone
              label="보낼 돈"
              hero={<span className="text-amount-send">−₩26,340</span>}
              aside={<Avatar {...MINJI} size="l" alt="" />}
              sub="결제 ₩180,000 · 부담 ₩206,340"
            />
          </Variant>
          <Variant name="label + hero만" className="w-[350px]">
            <CardHeroTone label="총 공동 지출" hero="₩0" />
          </Variant>
        </Row>
      </div>
    )
  },
})
