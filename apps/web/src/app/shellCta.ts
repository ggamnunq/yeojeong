import { createContext, useContext, useEffect, useLayoutEffect, useRef } from 'react'
import type { ScreenCta } from '../ds'

/** 셸 하단 CTA(Button Primary L FILL, 탭 위). 라벨은 문자열만(렌더마다 바뀌는 JSX면 매번 다시 단다) */
export type ShellCta = Omit<ScreenCta, 'label'> & { label: string; secondary?: { label: string; onClick: () => void } }

export const ShellCtaContext = createContext<(cta: ShellCta | null) => void>(() => {})

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
  const { label, disabled, htmlType, form } = cta ?? {}
  const secondaryLabel = cta?.secondary?.label

  useEffect(() => {
    if (!visible || label === undefined) return
    setCta({ label, disabled, htmlType, form, onClick: (event) => onClick.current?.(event), ...(secondaryLabel && { secondary: { label: secondaryLabel, onClick: () => secondaryClick.current?.() } }) })
    return () => setCta(null)
  }, [setCta, visible, label, disabled, htmlType, form, secondaryLabel])
}
