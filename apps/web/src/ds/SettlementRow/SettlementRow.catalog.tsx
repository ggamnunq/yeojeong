import { defineCatalog } from '../../catalog/catalog'
import { INITIAL, ME, TAEHYUN } from '../../catalog/people'
import { Sub } from '../../catalog/ui'
import { Divider } from '../Divider/Divider'
import { SettlementRow } from './SettlementRow'

export default defineCatalog({
  title: 'SettlementRow',
  figma: '24:8571',
  group: 'components',
  order: 28,
  Demo: function SettlementRowCatalog() {
    return (
      <div className="flex flex-col gap-8">
        <Sub title="net = 결제 − 부담의 부호 (receive · send · even)">
          <div className="flex w-[390px] flex-col">
            <SettlementRow person={INITIAL.minji} paid={482000} share={321000} />
            <Divider type="inset" />
            <SettlementRow person={INITIAL.seojun} paid={273000} share={321250} />
            <Divider type="inset" />
            <SettlementRow person={INITIAL.harin} paid={321000} share={321000} />
          </div>
        </Sub>
        <Sub title='member="left"(프사 Left + 「나간 멤버」 태그)'>
          <div className="flex w-[390px] flex-col">
            <SettlementRow person={INITIAL.minji} member="left" paid={482000} share={321000} />
            <Divider type="inset" />
            <SettlementRow person={INITIAL.seojun} member="left" paid={273000} share={321250} />
            <Divider type="inset" />
            <SettlementRow person={TAEHYUN} member="left" paid={120000} share={120000} />
          </div>
        </Sub>
        <Sub title="me(「나」 배지 + 프사 보라 테두리)">
          <div className="w-[390px]">
            <SettlementRow person={ME} paid={300000} share={348250} />
          </div>
        </Sub>
        <Sub title="tappable=false(비대화형 · › 없음)">
          <div className="w-[390px]">
            <SettlementRow person={{ name: '탈퇴한 멤버' }} paid={120000} share={120000} tappable={false} />
          </div>
        </Sub>
      </div>
    )
  },
})
