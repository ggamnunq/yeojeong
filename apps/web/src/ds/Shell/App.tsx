import type { ReactNode } from 'react'
import { BottomNav, type BottomNavProps } from '../BottomNav/BottomNav'
import { Screen, type ScreenCtaValue } from '../Screen/Screen'
import { TopHeader, type TopHeaderGroupProps } from '../TopHeader/TopHeader'

// Figma Shell/App(24:61193) · Time(TEXT) · Content(INSTANCE_SWAP). 여정 탭 화면(결제내역·현황·여정 정보·정산)의 셸.
// TopHeader Group(Menu on · 구분선 없음 · 그룹명 H2) → 내용(첫 블록 위 8, 좌우 거터 20) → BottomNav Tabs=3. 바탕 bg/surface.
// 상태바(44)·홈 인디케이터(34)는 시안용이라 그리지 않고 안전영역(env(safe-area-inset-*))으로 비운다 → Time 속성 없음.
// 레이아웃(문서 스크롤 · sticky 헤더/하단 · 390 열)은 Screen이 맡는다.
export type ShellAppProps = {
  /** Figma header(TopHeader Type=Group): groupName · menu · statusBadge · dropdown · 콜백 */
  header: Omit<TopHeaderGroupProps, 'type' | 'groupNameSize'>
  /** Figma nav(BottomNav Tabs=3): active · phase(진행 중·시작 전 ongoing, 종료 후 ended) · onChange · hrefs */
  nav?: Omit<BottomNavProps, 'children'>
  /** 화면 하단 BottomCTA(Single · Horizontal, 버튼마다 state) — 내비 위에 붙는다 */
  cta?: ScreenCtaValue
  /** 내용 좌우 거터 20. 전폭 DS 행(PaymentRow·TimelineItem·SettlementRow·ListItem·DateHeader…)만 쌓는 화면이면 false */
  gutter?: boolean
  /** Figma Content 슬롯(390 × 646) */
  children?: ReactNode
  className?: string
}

export function ShellApp({ header, nav, cta, gutter, children, className }: ShellAppProps) {
  return (
    <Screen
      background="surface"
      header={<TopHeader {...header} type="group" groupNameSize="h2" divider={false} />}
      nav={<BottomNav {...nav} />}
      cta={cta}
      gutter={gutter}
      contentClassName="pt-2"
      className={className}
    >
      {children}
    </Screen>
  )
}
