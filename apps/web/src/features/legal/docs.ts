import type { ConsentId } from '../../api'

// 공개 법적 문서(FR-903, 부록 C-7). 본문은 content/v<버전>/<file>.md를 빌드 때 ?raw로 읽는다(문서·판마다 따로 chunk).
// 게시본 원문은 docs/legal/v<버전>(정식 발행본, 레포에 있음) — scripts/sync-legal.mjs가 시행일을 채워 content/v<버전>/로 복사한다.
// 어느 판을 보여 줄지(현행·이전·예정, ?v=)는 versions.ts. 판이 없는 안내 문서(준비 중 등)는 content/<file>.md.
// 정식 전문이 없는 동의(연동 FIN_*·THIRD_PARTY, MARKETING)는 "준비 중" 안내(pending.md 등)로 연다.

export type LegalDocId =
  | 'terms'
  | 'privacy'
  | 'processors'
  | 'fin-link'
  | 'licenses'
  | 'consent-collection'
  | 'consent-third-party'
  | 'consent-card-import'
  | 'pending'

export type LegalDoc = {
  title: string
  /** content/v<버전>/ 아래 파일 이름(판이 없는 안내 문서는 content/ 바로 아래) */
  file: string
  /** docs/legal/v<버전> 원본 파일 이름(sync-legal.mjs·문서 안 링크 해석용). 게시본이 없는 안내 문서는 null */
  source: string | null
  /** 공개 주소 */
  path: string
  /** 동의서: **굵게**(중요 내용)를 크기·굵기·색으로 강조(「개인정보 보호법」 제22조제2항, docs/legal/v0.1/consents.md 2절) */
  consent?: boolean
}

export const LEGAL_DOCS: Record<LegalDocId, LegalDoc> = {
  terms: { title: '서비스 이용약관', file: 'terms.md', source: '서비스 이용약관.md', path: '/terms' },
  privacy: { title: '개인정보처리방침', file: 'privacy.md', source: '개인정보처리방침.md', path: '/privacy' },
  processors: {
    title: '개인정보 처리위탁',
    file: 'processors.md',
    source: '개인정보 처리위탁 고지.md',
    path: '/privacy/processors',
  },
  // 토스 연동을 켤 때 정식판을 게시한다(docs/ops/legal-publishing.md "게시 범위"). 지금은 준비 중 안내
  'fin-link': { title: '금융정보 연동 약관', file: 'fin-link.md', source: null, path: '/terms/fin-link' },
  // 약관 제27조②의 공개 주소는 /oss(예전 주소 /licenses는 라우터가 /oss로 보낸다)
  licenses: { title: '오픈소스 라이선스', file: 'licenses.md', source: '오픈소스 및 라이선스 고지.md', path: '/oss' },
  'consent-collection': {
    title: '개인정보 수집·이용',
    file: 'consent-collection.md',
    source: '개인정보 수집·이용 동의서.md',
    path: '/consents/PRIVACY',
    consent: true,
  },
  // S8 카드 승인내역 불러오기 동의(CARD_IMPORT) 전문 — 0.2 판에서 처음 게시(버전 0.1)
  'consent-card-import': {
    title: '카드 승인내역 불러오기',
    file: 'consent-card-import.md',
    source: '카드 내역 조회 동의서.md',
    path: '/consents/CARD_IMPORT',
    consent: true,
  },
  'consent-third-party': {
    title: '공동 결제 그룹 공개',
    file: 'consent-third-party.md',
    source: null,
    path: '/consents/THIRD_PARTY',
    consent: true,
  },
  /** 정식 전문이 없는 동의(MARKETING·FIN_PRIVACY) — /consents/:consentId로만 연다 */
  pending: { title: '동의서 준비 중', file: 'pending.md', source: null, path: '/consents/pending' },
}

/**
 * /consents/:consentId → 전문 문서(docs/legal/v<판> consents.md 1절). AGE14는 약관 제7조라 약관으로.
 * 정식 전문이 없는 동의(연동 FIN_*·마케팅)는 수집·이용 동의서에 그 내용이 없으므로
 * 그 문서로 보내지 않고 준비 중 안내로 연다(링크는 깨지지 않게 둔다)
 */
export const CONSENT_DOCS: Record<ConsentId, LegalDocId> = {
  TOS: 'terms',
  PRIVACY: 'consent-collection',
  AGE14: 'terms',
  MARKETING: 'pending',
  FIN_LINK: 'fin-link',
  FIN_PRIVACY: 'pending',
  THIRD_PARTY: 'consent-third-party',
  // S8 카드 승인내역 불러오기 동의 — 카드 내역 조회 동의서(0.2 판에서 게시, 버전 0.1)
  CARD_IMPORT: 'consent-card-import',
}

/** 화면 제목: 동의 항목이면 그 항목 제목(consents.md 1절 화면 제목) */
export const CONSENT_TITLES: Partial<Record<ConsentId, string>> = {
  FIN_PRIVACY: '금융정보 수집·이용',
  MARKETING: '마케팅 정보 수신',
  CARD_IMPORT: '카드 승인내역 불러오기',
}

export function consentDoc(consentId: string | undefined): LegalDocId | null {
  return consentId && Object.hasOwn(CONSENT_DOCS, consentId) ? CONSENT_DOCS[consentId as ConsentId] : null
}

/** 공개 주소 → 문서. /consents/:consentId는 동의 ID로 */
export function docForPath(pathname: string, consentId?: string): LegalDocId | null {
  if (consentId !== undefined) return consentDoc(consentId)
  const entry = Object.entries(LEGAL_DOCS).find(([id, doc]) => id !== 'pending' && doc.path === pathname)
  return entry ? (entry[0] as LegalDocId) : null
}

/** 문서가 자기 주소로 쓰는 서비스 origin. 이 주소로 시작하는 링크는 앱 안 경로로 연다 */
const SERVICE_ORIGIN = 'https://jinyeojeong.com'

/** 문서 안 링크(다른 docs/legal 파일 · 공개 주소 · https://jinyeojeong.com/…)를 앱 경로로. 모르면 null */
export function resolveLegalLink(href: string): string | null {
  if (href === SERVICE_ORIGIN || href.startsWith(`${SERVICE_ORIGIN}/`)) return href.slice(SERVICE_ORIGIN.length) || '/'
  if (href.startsWith('/') && !href.startsWith('//')) return href
  const file = decodeURIComponent(href.split('#')[0])
  return Object.values(LEGAL_DOCS).find((doc) => doc.source !== null && doc.source === file)?.path ?? null
}
