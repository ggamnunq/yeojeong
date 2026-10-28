import type { ReactNode } from 'react'
import { defineCatalog } from '../../catalog/catalog'
import { Sub, Variant } from '../../catalog/ui'
import { TopHeader } from './TopHeader'

const Frame = ({ children }: { children: ReactNode }) => <div className="w-[390px]">{children}</div>

export default defineCatalog({
  title: 'TopHeader',
  figma: '24:7328',
  group: 'components',
  order: 50,
  Demo: function TopHeaderCatalog() {
    return (
      <div className="flex flex-col gap-8">
        <Sub title='type="group" · 여정 화면 (Menu 기본 on)'>
          <div className="flex flex-wrap gap-6">
            <Variant name='type="group"'>
              <Frame>
                <TopHeader groupName="오사카 우정여행" />
              </Frame>
            </Variant>
            <Variant name="menu={false}">
              <Frame>
                <TopHeader groupName="오사카 우정여행" menu={false} />
              </Frame>
            </Variant>
            <Variant name='statusBadge · status="active"'>
              <Frame>
                <TopHeader groupName="오사카 우정여행" statusBadge />
              </Frame>
            </Variant>
            <Variant name='statusBadge · status="upcoming" | "ended"'>
              <div className="flex flex-col gap-2">
                <Frame>
                  <TopHeader groupName="제주 2박 3일" statusBadge status="upcoming" />
                </Frame>
                <Frame>
                  <TopHeader groupName="부산 먹방" statusBadge status="ended" />
                </Frame>
              </div>
            </Variant>
            <Variant name="긴 그룹명은 말줄임">
              <Frame>
                <TopHeader groupName="대학 동기들과 떠나는 오사카·교토 5박 6일 졸업여행" statusBadge />
              </Frame>
            </Variant>
            <Variant name='dropdown="open" (v1.4 · 그룹 전환 드롭다운 펼침, ⌃)'>
              <Frame>
                <TopHeader groupName="오사카 우정여행" dropdown="open" />
              </Frame>
            </Variant>
          </div>
        </Sub>
        <Sub title="Shell 인스턴스 덮어쓰기 — divider={false} · groupNameSize=&quot;h2&quot; (ShellApp·ShellSub가 넣는다)">
          <div className="flex flex-wrap gap-6">
            <Variant name="Shell/App 헤더">
              <Frame>
                <TopHeader groupName="오사카 3박 4일" divider={false} groupNameSize="h2" />
              </Frame>
            </Variant>
            <Variant name="Shell/Sub 헤더">
              <Frame>
                <TopHeader type="back" title="지갑" divider={false} />
              </Frame>
            </Variant>
          </div>
        </Sub>
        <Sub title='type="back" · 상세·지갑·마이'>
          <div className="flex flex-wrap gap-6">
            <Variant name='type="back" · action(more)'>
              <Frame>
                <TopHeader type="back" title="결제 상세" action={{ label: '더 보기' }} />
              </Frame>
            </Variant>
            <Variant name="action 없음">
              <Frame>
                <TopHeader type="back" title="지갑" />
              </Frame>
            </Variant>
          </div>
        </Sub>
        <Sub title='type="logo" · 소속 여정 없음'>
          <Variant name='type="logo"'>
            <Frame>
              <TopHeader type="logo" />
            </Frame>
          </Variant>
        </Sub>
      </div>
    )
  },
})
