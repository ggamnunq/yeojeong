import type { AvatarPerson } from '../Avatar/rules'

/** 스택에 보이는 최대 인원(Figma Count=5+ = 4명 + "+N") */
export const AVATAR_STACK_MAX = 4

export type AvatarStackCount = '2' | '3' | '4' | '5+'

/**
 * 몇 명을 그리고 "+N" 칩에 몇 명을 넣을지 정한다.
 * 5명 이상이면 앞의 4명 + "+(전체 − 4)". overflow를 끄면 칩 없이 4명까지만.
 */
export function avatarStackLayout(total: number, overflow = true) {
  const count = Math.max(0, Math.trunc(total))
  const shown = Math.min(count, AVATAR_STACK_MAX)
  const rest = overflow ? count - shown : 0
  const figmaCount: AvatarStackCount | null = count < 2 ? null : count > AVATAR_STACK_MAX ? '5+' : (String(count) as AvatarStackCount)
  return { shown, rest, figmaCount }
}

/**
 * 스택·멤버 목록 순서(spec C-05, screens.md): 나 먼저 → 나머지는 가입 순(joinOrder 오름차순).
 * 결제자를 앞세우지 않는다 — 결제자는 행 왼쪽 아바타로 이미 보인다.
 * joinOrder가 없는 사람은 넘긴 순서 그대로 맨 뒤에 둔다. 원본 배열은 바꾸지 않는다.
 */
export function orderMembers<T extends Pick<AvatarPerson, 'me' | 'joinOrder'>>(people: readonly T[]): T[] {
  const rank = (p: T) => (p.me ? -1 : (p.joinOrder ?? Number.POSITIVE_INFINITY))
  return people
    .map((person, index) => ({ person, index }))
    .sort((a, b) => rank(a.person) - rank(b.person) || a.index - b.index)
    .map(({ person }) => person)
}

/**
 * 접근성 이름. 나 먼저 → 가입 순으로 앞의 두 명 이름 + "외 N명".
 * 예: "나, 민지 외 2명" · "나, 민지" · "민지"
 */
export function avatarStackLabel(people: readonly Pick<AvatarPerson, 'name' | 'me'>[]) {
  const names = people.map((p) => (p.me ? '나' : p.name))
  const head = names.slice(0, 2).join(', ')
  const others = names.length - 2
  return others > 0 ? `${head} 외 ${others}명` : head
}
