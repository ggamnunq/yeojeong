import type { ReactNode } from 'react'
import { Screen, type ScreenCtaValue } from '../Screen/Screen'
import { TopHeader, type TopHeaderBackProps, type TopHeaderCloseProps, type TopHeaderLogoProps } from '../TopHeader/TopHeader'

// Figma Shell/Sub(24:61242) · Time(TEXT) · Content(INSTANCE_SWAP). 서브 화면 셸: 지갑·마이·환율·멤버별 내역·여정 생성·여정 없음.
// TopHeader Back(제목 H3 · 구분선 없음 · action은 기본 숨김) → 내용(첫 블록 위 16, 좌우 거터 20). 내비 없음. 바탕 bg/surface.
// 여정 없음(HF-09)은 header={{ type: 'logo' }}, 흐름을 닫는 화면(생성 완료 HF-11)은 header={{ type: 'close' }}(v1.6).
// 상태바·홈 인디케이터는 그리지 않는다(안전영역만).
export type ShellSubHeader = (Omit<TopHeaderBackProps, 'type'> & { type?: 'back' }) | TopHeaderLogoProps | TopHeaderCloseProps

export type ShellSubProps = {
  /** Figma header: 기본 TopHeader Back(title · onBack · action), 여정 없음은 { type: 'logo' }, 닫기는 { type: 'close', title?, onClose } */
  header: ShellSubHeader
  /** 하단 BottomCTA(Single = Primary L FILL · layout: "horizontal" = 가로 2버튼, 버튼마다 state), 아래 16 + 안전영역 — 여정 생성 등 */
  cta?: ScreenCtaValue
  /** 내용 좌우 거터 20. 전폭 DS 행만 쌓는 화면이면 false */
  gutter?: boolean
  /** Figma Content 슬롯(390 × 710) */
  children?: ReactNode
  className?: string
}

export function ShellSub({ header, cta, gutter, children, className }: ShellSubProps) {
  return (
    <Screen
      background="surface"
      header={
        header.type === 'logo' || header.type === 'close' ? (
          <TopHeader {...header} divider={false} />
        ) : (
          <TopHeader {...header} type="back" divider={false} />
        )
      }
      cta={cta}
      gutter={gutter}
      contentClassName="pt-4"
      className={className}
    >
      {children}
    </Screen>
  )
}
