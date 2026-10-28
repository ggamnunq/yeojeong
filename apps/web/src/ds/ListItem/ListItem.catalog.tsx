import { defineCatalog } from '../../catalog/catalog'
import { Sub } from '../../catalog/ui'
import { Divider } from '../Divider/Divider'
import { ListItem } from './ListItem'

export default defineCatalog({
  title: 'ListItem',
  figma: '24:8635',
  group: 'components',
  order: 30,
  Demo: function ListItemCatalog() {
    return (
      <div className="flex flex-col gap-8">
        <Sub title="type × Pressed(눌러서 확인) · 폭 390">
          <div className="flex w-[390px] flex-col">
            <ListItem type="navigation" leadingIcon="calendar" title="여정 기간" subtitle="10.27 (월) – 10.30 (목) · 3박 4일" />
            <ListItem type="value" leadingIcon="coins" title="예산" value="₩1,500,000" />
            <ListItem type="selected" leadingIcon="airplane" title="오사카 우정여행" subtitle="진행 중 · 4명" />
            <ListItem type="destructive" leadingIcon="logout" title="로그아웃" />
          </div>
        </Sub>
        <Sub title="subtitle·leadingIcon 끔 · value + onClick(누를 수 있는 값 행)">
          <div className="flex w-[390px] flex-col">
            <ListItem title="알림 설정" />
            <Divider type="inset" />
            <ListItem type="value" title="초대코드" value="K7Q2-9F" onClick={() => {}} />
          </div>
        </Sub>
      </div>
    )
  },
})
