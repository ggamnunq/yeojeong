import type { ConsentId } from '../../api'

// 공개 법적 문서(FR-903, 부록 C-7). 본문은 content/<file>.md를 빌드 때 ?raw로 읽는다(문서마다 따로 chunk).
// 원문은 docs/legal(로컬 전용). 레포에 커밋할지는 사용자 결정이라 지금 content/는 플레이스홀더다 — scripts/sync-legal.mjs가 복사한다.

export type LegalDocId = 'terms' | 'privacy' | 'fin-link' | 'licenses' | 'consent-collection' | 'consent-third-party'

export type LegalDoc = {
  title: string
  /** content/ 아래 파일 이름 */
  file: string
  /** docs/legal 원본 파일 이름(sync-legal.mjs·문서 안 링크 해석용) */
  source: string
  /** 공개 주소 */
  path: string
  /** 동의서: **굵게**(중요 내용)를 크기·굵기·색으로 강조(「개인정보 보호법」 제22조제2항, docs/legal README 2절) */
  consent?: boolean
}

export const LEGAL_DOCS: Record<LegalDocId, LegalDoc> = {
  terms: { title: '서비스 이용약관', file: 'terms.md', source: '서비스 이용약관.md', path: '/terms' },
  privacy: { title: '개인정보처리방침', file: 'privacy.md', source: '개인정보처리방침.md', path: '/privacy' },
  'fin-link': {
    title: '금융정보 연동 약관',
    file: 'fin-link.md',
    source: '금융정보 연동 이용약관(부속약관).md',
    path: '/terms/fin-link',
  },
  licenses: { title: '오픈소스 라이선스', file: 'licenses.md', source: '오픈소스 및 라이선스 고지.md', path: '/licenses' },
  'consent-collection': {
    title: '개인정보 수집·이용',
    file: 'consent-collection.md',
    source: '개인정보 수집·이용 동의서.md',
    path: '/consents/PRIVACY',
    consent: true,
  },
  'consent-third-party': {
    title: '공동 결제 그룹 공개',
    file: 'consent-third-party.md',
    source: '개인정보 제3자 제공 동의서.md',
    path: '/consents/THIRD_PARTY',
    consent: true,
  },
}

/** /consents/:consentId → 전문 문서(consents.md 1절). AGE14는 약관 제7조라 약관으로 */
export const CONSENT_DOCS: Record<ConsentId, LegalDocId> = {
  TOS: 'terms',
  PRIVACY: 'consent-collection',
  AGE14: 'terms',
  MARKETING: 'consent-collection',
  FIN_LINK: 'fin-link',
  FIN_PRIVACY: 'consent-collection',
  THIRD_PARTY: 'consent-third-party',
}

/** 화면 제목: 동의 항목이면 그 항목 제목(consents.md 1절 화면 제목) */
export const CONSENT_TITLES: Partial<Record<ConsentId, string>> = {
  FIN_PRIVACY: '금융정보 수집·이용',
  MARKETING: '마케팅 정보 수신',
}

export function consentDoc(consentId: string | undefined): LegalDocId | null {
  return consentId && Object.hasOwn(CONSENT_DOCS, consentId) ? CONSENT_DOCS[consentId as ConsentId] : null
}

/** 공개 주소 → 문서. /consents/:consentId는 동의 ID로 */
export function docForPath(pathname: string, consentId?: string): LegalDocId | null {
  if (consentId !== undefined) return consentDoc(consentId)
  const entry = Object.entries(LEGAL_DOCS).find(([, doc]) => doc.path === pathname)
  return entry ? (entry[0] as LegalDocId) : null
}

/** 문서 안 링크(다른 docs/legal 파일 · 공개 주소)를 앱 경로로. 모르면 null */
export function resolveLegalLink(href: string): string | null {
  if (href.startsWith('/') && !href.startsWith('//')) return href
  const file = decodeURIComponent(href.split('#')[0])
  return Object.values(LEGAL_DOCS).find((doc) => doc.source === file)?.path ?? null
}
