import { defineCatalog } from '../../catalog/catalog'
import { GROUP } from '../../catalog/people'
import { Row, Sub, Variant } from '../../catalog/ui'
import { DateHeader } from '../DateHeader/DateHeader'
import { TimelineItem, type TimelineItemStyle } from './TimelineItem'

function Day({ style }: { style: TimelineItemStyle }) {
  return (
    <div className="flex w-[390px] flex-col bg-canvas">
      <DateHeader date="10월 28일 (화)" day="2일차" />
      <TimelineItem type="now" style={style} time="15:40" meta="오사카성 공원 근처" />
      <TimelineItem
        type="shared"
        style={style}
        time="12:40"
        merchant="이치란 라멘 도톤보리점"
        amount={28400}
        meta="¥3,200 · 민지"
        participants={GROUP.slice(0, 4)}
      />
      <TimelineItem type="personal" style={style} time="14:05" merchant="돈키호테 난바점" amount={41300} meta="¥4,650 · 내 결제" />
      <TimelineItem
        type="pending"
        style={style}
        position="last"
        time="15:12"
        merchant="FamilyMart 난바역"
        amount={5320}
        meta="¥599 · 하린"
      />
    </div>
  )
}

export default defineCatalog({
  title: 'TimelineItem',
  figma: '24:8408',
  group: 'components',
  order: 25,
  Demo: function TimelineItemCatalog() {
    return (
      <div className="flex flex-col gap-8">
        <Sub title='Now → Shared → Personal → Pending(position="last") · 간격 0으로 쌓음'>
          <Row>
            <Variant name='style="card"'>
              <Day style="card" />
            </Variant>
            <Variant name='style="plain"'>
              <Day style="plain" />
            </Variant>
          </Row>
        </Sub>
        <Sub title='type="now" · position="last"'>
          <div className="w-[390px] bg-canvas">
            <TimelineItem type="now" position="last" time="15:40" meta="오사카성 공원 근처" />
          </div>
        </Sub>
      </div>
    )
  },
})
