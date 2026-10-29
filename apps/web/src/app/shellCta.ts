import { createContext, useContext, useEffect, useLayoutEffect, useRef } from 'react'
import type { BottomCTAState, ScreenCtaValue } from '../ds'

/**
 * 셸 하단 CTA(탭 위). 버튼 하나(Primary L FILL), secondary가 있으면 DS BottomCTA Layout=Horizontal(왼쪽 보조 · 오른쪽 주 행동, 1:1).
 * 라벨은 문자열만(렌더마다 바뀌는 JSX면 매번 다시 단다).
 */
export type ShellCta = {
  label: string
  onClick: () => void
  disabled?: boolean
  state?: BottomCTAState
  /** 왼쪽 보조 버튼. 파괴적이면 type 'danger-weak'(그룹 삭제) */
  secondary?: { label: string; type?: 'secondary' | 'danger-weak'; onClick: () => void }
}

export const ShellCtaContext = createContext<(cta: ShellCta | null) => void>(() => {})

/** ShellCta → Screen cta(BottomCTA 값) */
export function toScreenCta(cta: ShellCta | null): ScreenCtaValue | undefined {
  if (!cta) return undefined
  const primary = { label: cta.label, onClick: cta.onClick, disabled: cta.disabled, state: cta.state }
  if (!cta.secondary) return primary
  const { label, type, onClick } = cta.secondary
  return { layout: 'horizontal', secondary: { label, type, onClick }, primary }
}

/**
 * trip 레이아웃 페이지가 셸 하단 CTA를 단다. null·undefined면 없음. 페이지를 떠나면 지운다.
 * 예: useShellCta(isLeader ? { label: '여정 시작', onClick: openStartDialog } : null)
 */
export function useShellCta(cta: ShellCta | null | undefined) {
  const setCta = useContext(ShellCtaContext)
  const onClick = useRef(cta?.onClick)
  const secondaryClick = useRef(cta?.secondary?.onClick)
  useLayoutEffect(() => {
    onClick.current = cta?.onClick
    secondaryClick.current = cta?.secondary?.onClick
  })
  const visible = cta != null
  const { label, disabled, state } = cta ?? {}
  const secondaryLabel = cta?.secondary?.label
  const secondaryType = cta?.secondary?.type

  useEffect(() => {
    if (!visible || label === undefined) return
    setCta({
      label,
      disabled,
      state,
      onClick: () => onClick.current?.(),
      ...(secondaryLabel && {
        secondary: { label: secondaryLabel, type: secondaryType, onClick: () => secondaryClick.current?.() },
      }),
    })
    return () => setCta(null)
  }, [setCta, visible, label, disabled, state, secondaryLabel, secondaryType])
}
