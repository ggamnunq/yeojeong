import type { SVGProps } from 'react'

// Figma Illust/*(v1.4) — 로고의 두 ㅇ(출발 보라 → 도착 노을) 모티프 일러스트. Figma 벡터를 SVG로 내보낸 좌표 그대로,
// 색만 토큰 클래스(fill-primary-* · stroke-sunset-* …)로 바꿨다. Icons8 컬러 PNG는 쓰지 않는다.
// 기본은 장식(aria-hidden). 그림만으로 뜻을 전해야 하면 label을 준다.
//   Illust/Empty-Trip(24:61381) 결제 없음·여정 없음 · Illust/Linked(24:61389) 연동 완료
//   Illust/Settled(24:61395) 정산 완료·연결 결과 · Illust/Linking(24:61424) 지갑 연결 3단계 Phase=Before/Pending/Done
type IllustBaseProps = Omit<SVGProps<SVGSVGElement>, 'ref' | 'children' | 'width' | 'height' | 'viewBox'> & {
  /** 그림이 뜻을 가질 때 읽어 줄 이름 */
  label?: string
}

export type IllustProps = IllustBaseProps & {
  /** 한 변 px. Figma 원본 140, 쓰는 크기 120~160 */
  size?: number
}

function a11y(label?: string) {
  return label ? { role: 'img', 'aria-label': label } : { 'aria-hidden': true as const }
}

export function IllustEmptyTrip({ size = 140, label, ...rest }: IllustProps) {
  return (
    <svg viewBox="0 0 140 140" width={size} height={size} fill="none" focusable="false" {...a11y(label)} {...rest}>
      <path
        className="fill-primary-100"
        fillRule="evenodd"
        d="M96 86a40 40 0 1 1-80 0 40 40 0 0 1 80 0ZM34 86a22 22 0 1 0 44 0 22 22 0 0 0-44 0Z"
      />
      <circle className="fill-primary-300" cx="56" cy="86" r="7" />
      <circle className="fill-primary-300" cx="98" cy="66" r="3.5" />
      <circle className="fill-primary-200" cx="110" cy="52" r="3.5" />
      <circle className="fill-primary-200" cx="119" cy="38" r="3.5" />
      <circle className="stroke-sunset-300" cx="124" cy="20" r="8.5" strokeWidth="3" />
    </svg>
  )
}

// 맞물린 두 링(왼쪽 보라 200 · 오른쪽 보라 100) + 연결점(노을 300). 오른쪽 링의 아래쪽 호를 왼쪽 링 위에 한 번 더 그려 고리처럼 엮는다.
function LinkedArt() {
  return (
    <>
      <path
        className="fill-primary-100"
        fillRule="evenodd"
        d="M122 76a34 34 0 1 1-68 0 34 34 0 0 1 68 0ZM69 76a19 19 0 1 0 38 0 19 19 0 0 0-38 0Z"
      />
      <path
        className="fill-primary-200"
        fillRule="evenodd"
        d="M86 76a34 34 0 1 1-68 0 34 34 0 0 1 68 0ZM33 76a19 19 0 1 0 38 0 19 19 0 0 0-38 0Z"
      />
      <path
        className="fill-primary-100"
        d="M75.4838 107.612C69.485 105.237 64.2857 101.204 60.4934 95.9847C56.7011 90.765 54.4722 84.574 54.0671 78.1349L69.0375 77.193C69.2639 80.7914 70.5094 84.251 72.6287 87.1679C74.7479 90.0848 77.6534 92.3385 81.0056 93.6658L75.4838 107.612Z"
      />
      <circle className="fill-sunset-300" cx="70" cy="34" r="7" />
    </>
  )
}

export function IllustLinked({ size = 140, label, ...rest }: IllustProps) {
  return (
    <svg viewBox="0 0 140 140" width={size} height={size} fill="none" focusable="false" {...a11y(label)} {...rest}>
      <LinkedArt />
    </svg>
  )
}

export function IllustSettled({ size = 140, label, ...rest }: IllustProps) {
  return (
    <svg viewBox="0 0 140 140" width={size} height={size} fill="none" focusable="false" {...a11y(label)} {...rest}>
      <path
        className="fill-primary-100"
        fillRule="evenodd"
        d="M104 82a44 44 0 1 1-88 0 44 44 0 0 1 88 0ZM34 82a26 26 0 1 0 52 0 26 26 0 0 0-52 0Z"
      />
      <path
        className="stroke-primary-300"
        d="M46 82L56 92L75 71"
        strokeWidth="6"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <circle className="fill-primary-300" cx="104" cy="50" r="3.5" />
      <circle className="fill-primary-300" cx="114" cy="38" r="3.5" />
      <circle className="fill-sunset-300" cx="124" cy="22" r="10" />
    </svg>
  )
}

export type IllustLinkingPhase = 'before' | 'pending' | 'done'

export type IllustLinkingProps = IllustBaseProps & {
  /** Figma Phase: before = 두 링 + 경로 · pending = 가운데 지금 노드(보라) · done = 겹친 링(Illust/Linked) */
  phase?: IllustLinkingPhase
  /** 폭 px. Figma 원본 264 × 168(높이는 비율대로) */
  width?: number
}

// Figma Illust/Linking 세트(264×168)는 140 기준 그림을 1.2배로 키운 것이다. Done은 Illust/Linked를 1.2배로 가운데(왼쪽 48)에 둔다.
export function IllustLinking({ phase = 'before', width = 264, label, ...rest }: IllustLinkingProps) {
  return (
    <svg
      viewBox="0 0 264 168"
      width={width}
      height={(width * 168) / 264}
      fill="none"
      focusable="false"
      {...a11y(label)}
      {...rest}
    >
      {phase === 'done' ? (
        <g transform="translate(48 0) scale(1.2)">
          <LinkedArt />
        </g>
      ) : (
        <>
          <path
            className="fill-primary-200"
            fillRule="evenodd"
            d="M93.6 91.2a40.8 40.8 0 1 1-81.6 0 40.8 40.8 0 0 1 81.6 0ZM30 91.2a22.8 22.8 0 1 0 45.6 0 22.8 22.8 0 0 0-45.6 0Z"
          />
          <path
            className="fill-primary-100"
            fillRule="evenodd"
            d="M252 91.2a40.8 40.8 0 1 1-81.6 0 40.8 40.8 0 0 1 81.6 0ZM188.4 91.2a22.8 22.8 0 1 0 45.6 0 22.8 22.8 0 0 0-45.6 0Z"
          />
          <circle className="fill-primary-300" cx="112.8" cy="91.2" r="4.2" />
          {phase === 'pending' ? (
            <>
              <circle className="fill-bg-surface stroke-primary-500" cx="132" cy="91.2" r="6.6" strokeWidth="3.6" />
              <circle className="fill-neutral-300" cx="151.2" cy="91.2" r="4.2" />
            </>
          ) : (
            <>
              <circle className="fill-primary-200" cx="132" cy="91.2" r="4.2" />
              <circle className="fill-primary-200" cx="151.2" cy="91.2" r="4.2" />
            </>
          )}
          <circle className="stroke-sunset-300" cx="132" cy="36" r="6.6" strokeWidth="3.6" />
        </>
      )}
    </svg>
  )
}
