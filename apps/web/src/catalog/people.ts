import type { AvatarPerson } from '../ds/Avatar/rules'
// 카탈로그 전용 프사 플레이스홀더. Figma DS 샘플 사진(자체 생성 회색조 이미지, Icons8 아님)을 128px로 내보낸 것.
// 운영 CSP(img-src 'self' data:)가 외부 이미지를 막아서 카카오 프사 대신 로컬 파일을 쓴다.
import photoA from './photos/photo-a.png'
import photoB from './photos/photo-b.png'

export const PHOTOS = { a: photoA, b: photoB }

// Figma 샘플과 같은 그룹. 준용·민지 = 사진, 태현·수빈 = 사진 없음(기본 이미지), 서준·하린 = 이니셜. 배열 순서 = 나 먼저 → 가입 순.
export const ME: AvatarPerson = { name: '준용', src: photoA, joinOrder: 0, me: true }
export const MINJI: AvatarPerson = { name: '민지', src: photoB, joinOrder: 1 }
export const TAEHYUN: AvatarPerson = { name: '태현', joinOrder: 2 }
export const SUBIN: AvatarPerson = { name: '수빈', joinOrder: 3 }
export const SEOJUN: AvatarPerson = { name: '서준', source: 'initial', joinOrder: 4 }
export const HARIN: AvatarPerson = { name: '하린', source: 'initial', joinOrder: 5 }

export const GROUP: AvatarPerson[] = [ME, MINJI, TAEHYUN, SUBIN, SEOJUN, HARIN]

// Figma 결제 행·정산 행 샘플의 이니셜 아바타(민 Violet · 서 Sunset · 하 Green)
export const INITIAL = {
  minji: { name: '민지', source: 'initial', color: 'violet' },
  seojun: { name: '서준', source: 'initial', color: 'sunset' },
  harin: { name: '하린', source: 'initial', color: 'green' },
} as const satisfies Record<string, AvatarPerson>
