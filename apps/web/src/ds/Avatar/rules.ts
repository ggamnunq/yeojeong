// Avatar의 순수 로직(프사 폴백·이니셜 색·접근성 이름). 컴포넌트 파일과 나눠서 테스트하고 fast refresh를 지킨다.
export type AvatarColor = 'violet' | 'sunset' | 'green' | 'blue' | 'amber' | 'gray'
export type AvatarSize = 'xs' | 's' | 'm' | 'l' | 'xl'
export type AvatarSource = 'initial' | 'photo' | 'default'

/** 그룹 합류 순서대로 고정 배정하는 이니셜 색(spec 7-2) */
export const AVATAR_COLORS: readonly AvatarColor[] = ['violet', 'sunset', 'green', 'blue', 'amber', 'gray']

/** 합류 순서(0부터) → 이니셜 색. 7번째부터는 처음 색으로 돌아간다. */
export function avatarColorByJoinOrder(joinOrder: number): AvatarColor {
  const n = AVATAR_COLORS.length
  return AVATAR_COLORS[((Math.trunc(joinOrder) % n) + n) % n]
}

/**
 * 실제로 그릴 Source를 정한다(spec 7-2 프사 규칙).
 * - source를 안 주면 src 유무로: 사진이 있으면 photo, 없으면 default(「여정」 기본 이미지)
 * - photo인데 src가 비었으면 default, 사진을 못 불러왔으면 initial
 * - initial·default를 직접 주면 그대로
 */
export function resolveAvatarSource({
  source,
  src,
  failed = false,
}: {
  source?: AvatarSource
  src?: string | null
  failed?: boolean
}): AvatarSource {
  if (source === 'initial' || source === 'default') return source
  if (!src) return 'default'
  return failed ? 'initial' : 'photo'
}

/** 이니셜 = 이름 첫 글자(로마자는 대문자) */
export const avatarInitial = (name: string) => (Array.from(name.trim())[0] ?? '').toLocaleUpperCase('ko-KR')

/** 접근성 이름. 색(Me 테두리·Left 흐림)만으로 상태를 전하지 않도록 글자로도 붙인다(spec 7-2). */
export function avatarLabel({ name, me = false, left = false }: { name: string; me?: boolean; left?: boolean }) {
  return [name, me && '(나)', left && '(나간 멤버)'].filter(Boolean).join(' ')
}

/** 스택·행이 사람 한 명을 넘길 때 쓰는 모양(Avatar props의 일부) */
export type AvatarPerson = {
  /** 이니셜과 접근성 이름에 쓰는 사람 이름 */
  name: string
  /** 프사 URL(카카오) */
  src?: string | null
  source?: AvatarSource
  color?: AvatarColor
  joinOrder?: number
  /** 나 */
  me?: boolean
  /** 나간 멤버 */
  left?: boolean
  initial?: string
}
