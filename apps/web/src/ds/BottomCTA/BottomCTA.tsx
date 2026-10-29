import { clsx } from 'clsx'
import { Button, type ButtonProps, type ButtonState, type ButtonType } from '../Button/Button'

// Figma BottomCTA(세트 69:10702, v1.6.2) · Layout=Single(69:10683)/Horizontal(69:10689). 350 × 56.
// 셸(Screen·ShellApp·ShellSub·ShellOnboarding)·BottomSheet의 cta prop이 그리는 하단 버튼 영역(화면명세 v0.5.8 0-4).
// Single = Button Primary L 하나 FILL(v1.6까지 모습, 기본).
// Horizontal = 버튼 2개 가로 2열, 간격 8(space/8), 1:1(grid 1fr 1fr). 왼쪽 secondary = Secondary L(파괴적이면 Danger-weak L),
// 오른쪽 primary = Primary L. 세로로 쌓는 변형은 없다. 보조 행동이 텍스트 링크면 쓰지 않는다(링크는 CTA 아래).
// Figma에서 primary·secondary는 노출 인스턴스라 라벨·Type·State(Loading 포함)를 버튼마다 바꾼다.
export type BottomCTALayout = 'single' | 'horizontal'

/** CTA 버튼이 받는 Figma State. Pressed는 CSS(:active)라 빠진다. disabled는 `disabled` 속성과 같다 */
export type BottomCTAState = ButtonState | 'disabled'

export type BottomCTAButton = Pick<
  ButtonProps,
  'label' | 'onClick' | 'disabled' | 'htmlType' | 'form' | 'aria-label' | 'leadingIcon' | 'icon'
> & {
  /** Figma 노출 인스턴스의 Type. 기본 primary = Primary, secondary = Secondary */
  type?: ButtonType
  /** Figma State: loading = 스피너(누름 무시·포커스 유지), disabled = 비활성. 기본 default */
  state?: BottomCTAState
}

/** Layout=Single(기본): 버튼 하나, Primary L FILL */
export type BottomCTASingle = BottomCTAButton & {
  layout?: 'single'
}

/** Layout=Horizontal: 왼쪽 secondary + 오른쪽 primary, 1:1 */
export type BottomCTAHorizontal = {
  layout: 'horizontal'
  /** 왼쪽 보조 버튼. 기본 Type=Secondary, 파괴적이면 type: 'danger-weak' */
  secondary: BottomCTAButton
  /** 오른쪽 주 행동 버튼. 기본 Type=Primary */
  primary: BottomCTAButton
}

export type BottomCTAValue = BottomCTASingle | BottomCTAHorizontal

/** CTA 객체 → Button props. state="disabled"는 disabled 속성으로 바꾼다 */
function toButtonProps({ state, disabled, ...rest }: Omit<BottomCTAButton, 'type'>) {
  return {
    ...rest,
    state: state === 'loading' ? ('loading' as const) : ('default' as const),
    disabled: disabled || state === 'disabled' || undefined,
  }
}

export type BottomCTAProps = {
  cta: BottomCTAValue
  className?: string
}

/** 하단 CTA 버튼 영역(바깥 여백·배경은 셸·시트가 정한다) */
export function BottomCTA({ cta, className }: BottomCTAProps) {
  if (cta.layout !== 'horizontal') {
    const { layout: _layout, type = 'primary', ...button } = cta
    return <Button type={type} size="l" {...toButtonProps(button)} className={clsx('w-full', className)} />
  }
  const { type: secondaryType = 'secondary', ...secondary } = cta.secondary
  const { type: primaryType = 'primary', ...primary } = cta.primary
  return (
    <div data-layout="horizontal" className={clsx('grid w-full grid-cols-2 gap-2', className)}>
      <Button type={secondaryType} size="l" {...toButtonProps(secondary)} className="w-full min-w-0" />
      <Button type={primaryType} size="l" {...toButtonProps(primary)} className="w-full min-w-0" />
    </div>
  )
}
