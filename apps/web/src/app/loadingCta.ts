import type { BottomSheetCta, ButtonState, ScreenCta } from '../ds'

/**
 * 셸·시트 하단 CTA에 Button State=Loading(DS v1.5)을 켠다(화면명세 0-6 「제출 중」: 누른 버튼에 스피너, 중복 탭 막기).
 * DS ScreenCta·BottomSheetCta 타입에는 아직 state가 없지만 셸·시트는 cta를 Button에 그대로 펼쳐 넘기므로 덧붙여 보낸다.
 * TODO(DS): 두 타입에 'state'가 들어오면 이 함수를 지우고 cta에 state를 바로 쓴다.
 */
export function withLoading<T extends ScreenCta | BottomSheetCta>(cta: T, loading: boolean): T {
  const state: ButtonState = loading ? 'loading' : 'default'
  return { ...cta, state } as T
}
