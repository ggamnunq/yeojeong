// 컴포넌트가 같이 쓰는 클래스 조각
export const focusRing = 'focus-visible:outline-hidden focus-visible:shadow-focus-ring'

// 보이는 크기는 Figma 그대로 두고, 누르는 영역만 가운데 기준 최소 44×44(layout/touch-min)로 넓힌다
export const touchTarget =
  'relative before:absolute before:top-1/2 before:left-1/2 before:size-full before:min-h-touch-min before:min-w-touch-min before:-translate-1/2'
