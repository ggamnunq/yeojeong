import { defineCatalog } from '../../catalog/catalog'
import { ME, MINJI, SUBIN, TAEHYUN } from '../../catalog/people'
import { Sub } from '../../catalog/ui'
import { RowMember } from './Member'

export default defineCatalog({
  title: 'Row/Member',
  figma: '30:69575',
  group: 'components',
  order: 84,
  Demo: function RowMemberCatalog() {
    return (
      <div className="flex flex-col gap-8">
        <Sub title="leader · me · kick (300 폭, 그룹장 시점)">
          <div className="flex w-[300px] flex-col bg-surface">
            <RowMember person={ME} leader />
            <RowMember person={MINJI} kick={{}} />
            <RowMember person={TAEHYUN} kick={{}} />
            <RowMember person={SUBIN} kick={{}} />
          </div>
        </Sub>
        <Sub title="Figma 기본(아무 속성 없음) · 멤버 시점">
          <div className="flex w-[300px] flex-col bg-surface">
            <RowMember person={{ ...ME, me: false }} leader />
            <RowMember person={{ ...MINJI, me: true }} />
          </div>
        </Sub>
      </div>
    )
  },
})
