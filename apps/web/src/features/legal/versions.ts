import { LEGAL_DOCUMENT_VERSIONS, type LegalDocumentVersion } from '@yeojeong/shared'

// 공개 문서의 판(버전)과 시행일. 문서마다 "지금 시각까지 시행된 가장 최근 판"이 현행이다 — 시행일 0시(KST)에 저절로 바뀐다.
// 판 목록은 scripts/sync-legal.mjs가 게시본 머리 줄("버전 X · 시행일 YYYY-MM-DD")로 만든 packages/shared legal-manifest.ts.
// 판 폴더(content/v<판>/)에는 그 판에서 바뀐 문서만 있다. 바뀌지 않은 문서는 이전 판이 계속 현행이다.
// 서버 동의 판정(apps/api consent_documents.effective_at)과 같은 시각 기준이다.
//
// 공개 주소 규칙(처리방침 "이전 버전은 같은 공개 주소에서 계속 확인"): <문서 주소>?v=<버전>.
// - 현행보다 앞선 판 = "이전 버전", 아직 시행 전인 판 = "예정 버전"(개정 공지에서 미리 보기). 없는 v 값은 현행으로 연다.
// - 게시 당시 표기(1.0 → 0.1, 1.1 → 0.2)로 된 옛 링크도 같은 판으로 연다.

/** 옛 표기 → 지금 표기(MVP 기간 0.x 재번호, 2026-10-30) */
export const LEGACY_VERSION_ALIASES: Readonly<Record<string, string>> = { '1.0': '0.1', '1.1': '0.2' }

type Manifest = Readonly<Record<string, readonly LegalDocumentVersion[]>>

/** 시행 시각: 시행일 00:00 KST */
export const effectiveAt = (date: string) => new Date(`${date}T00:00:00+09:00`)

export type LegalVersionStatus = 'current' | 'previous' | 'upcoming'

export type LegalVersionInfo = {
  version: string
  /** content/ 아래 경로: v0.2/privacy.md */
  path: string
  /** 시행일(YYYY-MM-DD) */
  effectiveDate: string
  /** 다음 판 시행 전날(YYYY-MM-DD, 같은 날 바뀌었으면 시행일). 마지막 판이면 null */
  lastDate: string | null
  status: LegalVersionStatus
}

export type ResolvedLegalVersion = {
  /** 보여 줄 판 */
  shown: LegalVersionInfo
  /** 현행 판 */
  current: LegalVersionInfo
  /** 이 문서의 모든 판(오래된 것부터) */
  versions: LegalVersionInfo[]
}

function dayBefore(date: string) {
  const d = new Date(`${date}T00:00:00Z`)
  d.setUTCDate(d.getUTCDate() - 1)
  return d.toISOString().slice(0, 10)
}

/**
 * 문서(content 파일 이름)의 판들 중 보여 줄 판을 고른다.
 * @param requested ?v= 값(옛 표기 포함). 이 문서에 없는 판이면 무시하고 현행
 * @returns 판이 없는 문서(준비 중 안내 등)는 null
 */
export function resolveLegalVersion(
  file: string,
  requested: string | null,
  now: Date = new Date(),
  manifest: Manifest = LEGAL_DOCUMENT_VERSIONS,
): ResolvedLegalVersion | null {
  const own = manifest[file] ?? []
  if (own.length === 0) return null
  const t = now.getTime()
  // 첫 판 시행 전이면 첫 판을 현행으로 본다(게시일 0시 전 미리 보기)
  const currentIndex = Math.max(
    own.findLastIndex((v) => effectiveAt(v.effectiveDate).getTime() <= t),
    0,
  )
  const versions = own.map((v, i): LegalVersionInfo => {
    const next = own[i + 1]
    return {
      version: v.version,
      path: v.path,
      effectiveDate: v.effectiveDate,
      lastDate: next ? [dayBefore(next.effectiveDate), v.effectiveDate].sort().at(-1)! : null,
      status: i === currentIndex ? 'current' : i < currentIndex ? 'previous' : 'upcoming',
    }
  })
  const current = versions[currentIndex]
  const wanted = requested === null ? null : (LEGACY_VERSION_ALIASES[requested] ?? requested)
  const shown = versions.find((v) => v.version === wanted) ?? current
  return { shown, current, versions }
}

/** 같은 해면 월-일만: 2026-11-05 → 11-05 */
const short = (date: string, base: string) => (date.slice(0, 4) === base.slice(0, 4) ? date.slice(5) : date)

/** 다른 판 링크 문구: "이전 버전 · 0.1(2026-10-30 ~ 11-05)" · "예정 버전 · 0.2(11-06부터)" · "현행 버전 · 0.2(2026-11-06부터)" */
export function versionLinkLabel(v: LegalVersionInfo, current: LegalVersionInfo) {
  if (v.status === 'upcoming') return `예정 버전 · ${v.version}(${short(v.effectiveDate, current.effectiveDate)}부터)`
  const period = v.lastDate ? `${v.effectiveDate} ~ ${short(v.lastDate, v.effectiveDate)}` : `${v.effectiveDate}부터`
  return `${v.status === 'previous' ? '이전 버전' : '현행 버전'} · ${v.version}(${period})`
}

/** 현행이 아닌 판을 볼 때 맨 위 안내 */
export function versionNotice(v: LegalVersionInfo): string | null {
  if (v.status === 'upcoming') return `예정 버전 ${v.version}이에요. ${v.effectiveDate}부터 적용돼요`
  if (v.status === 'previous') return `이전 버전 ${v.version}이에요. ${v.effectiveDate} ~ ${v.lastDate}에 적용됐어요`
  return null
}

/** 판(릴리스) 안내 한 줄 — 개정 공지("이용약관이 바뀌어요")를 눌러 온 화면에서 함께 바뀐 문서 앞에 보인다 */
export const RELEASE_NOTES: Readonly<Record<string, string>> = {
  'v0.2': '개인정보처리방침을 바로잡고 카드 불러오기 안내를 더했어요',
}

export type ReleaseCompanion = { file: string; version: string; effectiveDate: string }

/** 같은 판(폴더)에서 함께 바뀐 다른 문서들(이 문서 제외, manifest 순서) */
export function releaseCompanions(
  path: string,
  file: string,
  manifest: Manifest = LEGAL_DOCUMENT_VERSIONS,
): { dir: string; note: string | null; docs: ReleaseCompanion[] } {
  const dir = path.split('/')[0]
  const docs = Object.entries(manifest).flatMap(([other, versions]) =>
    other === file
      ? []
      : versions
          .filter((v) => v.path.startsWith(`${dir}/`))
          .map((v) => ({ file: other, version: v.version, effectiveDate: v.effectiveDate })),
  )
  return { dir, note: RELEASE_NOTES[dir] ?? null, docs }
}
