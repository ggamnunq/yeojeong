// 약관 게시본(docs/legal/v<판>) → 웹 사본 · 버전 목록 · 동의 문서 마이그레이션. 원문이나 게시일을 바꾼 뒤 다시 돌린다.
//   pnpm --filter @yeojeong/web legal:sync                                    # docs/legal/releases.json의 게시일로 전부 다시 만든다
//   pnpm --filter @yeojeong/web legal:sync -- --published 2026-11-02          # 마지막 판의 게시일을 정하고(releases.json) 다시 만든다 — 머지하는 날
//   pnpm --filter @yeojeong/web legal:sync -- --from <dir> [--release v0.2]   # 작성 세션의 사본을 먼저 docs/legal/<판>으로 복사(기본: 마지막 판)
//   pnpm --filter @yeojeong/web legal:sync -- --check                         # 아무것도 쓰지 않고 최신인지만 확인(다르면 exit 1)
//
// 하는 일(releases.json의 판 순서대로)
// 1. 판 폴더에 있는 게시 문서의 자리표시를 채운다: {{시행일}}·{{게시일}} = 그 판의 게시일, {{게시일+N}} = 게시일 + N일.
//    원문(docs/legal)은 자리표시를 그대로 둔다 — 게시일만 바꿔 다시 만들 수 있게. 게시본 = 채운 웹 사본(content/<판>/<file>.md).
// 2. 문서 머리 줄 "버전 X · 시행일 YYYY-MM-DD"를 읽어 문서별 버전 목록을 만든다(packages/shared/src/legal-manifest.ts).
//    판 폴더에 없는 문서는 이전 판이 그대로 현행이다(복사하지 않는다). 웹은 문서마다 그 시각까지 시행된 가장 최근 판을 보여 준다.
// 3. 그 판 consents.md 1절 표에서 새로 나온 동의 버전(TOS·PRIVACY·AGE14·CARD_IMPORT)을 읽어 doc_hash 칸을 채우고,
//    동의 문서 행(버전·시행 시각·해시·재동의 필요 여부·구 표기)을 manifest와 마이그레이션 SQL로 만든다.
// 초안(docs/legal/*.md, 판 폴더 밖)은 읽지도 복사하지도 않는다 — 공개 레포에 올리지 않는다.
import { createHash } from 'node:crypto'
import { copyFileSync, existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const here = dirname(fileURLToPath(import.meta.url))
const repo = resolve(here, '../../..')
const legalDir = join(repo, 'docs/legal')
const releasesPath = join(legalDir, 'releases.json')
const contentDir = join(here, '../src/features/legal/content')
const manifestPath = join(repo, 'packages/shared/src/legal-manifest.ts')
/** 0.x 동의 문서 행을 넣는 마이그레이션(이 스크립트가 만든다). 운영에 적용한 뒤에는 새 판을 새 마이그레이션으로 낸다 */
const MIGRATION = '20261030020000_consent_documents_v0_x'
const migrationPath = join(repo, 'apps/api/prisma/migrations', MIGRATION, 'migration.sql')

// src/features/legal/docs.ts의 file ↔ source와 같게 둔다
export const FILES = {
  'terms.md': '서비스 이용약관.md',
  'privacy.md': '개인정보처리방침.md',
  'consent-collection.md': '개인정보 수집·이용 동의서.md',
  'processors.md': '개인정보 처리위탁 고지.md',
  'licenses.md': '오픈소스 및 라이선스 고지.md',
  'consent-card-import.md': '카드 내역 조회 동의서.md',
}
/** 동의 ID → 전문(AGE14는 근거 조항 제7조가 있는 이용약관). 제목·필수는 apps/api consent_documents와 같다 */
const CONSENTS = {
  TOS: { file: 'terms.md', title: '서비스 이용약관', required: true },
  PRIVACY: { file: 'consent-collection.md', title: '개인정보 수집·이용', required: true },
  AGE14: { file: 'terms.md', title: '만 14세 이상입니다', required: true },
  CARD_IMPORT: { file: 'consent-card-import.md', title: '카드 승인내역 불러오기', required: true },
}
/** 레포에만 두고 웹에는 게시하지 않는 개발용 문서(README는 .gitignore — 로컬 전용) */
const DOCS_ONLY = ['consents.md', 'README.md']

const args = process.argv.slice(2)
const check = args.includes('--check')
const valueOf = (flag) => {
  const i = args.indexOf(flag)
  if (i < 0) return null
  if (!args[i + 1] || args[i + 1].startsWith('--')) throw new Error(`${flag} 뒤에 값이 없다`)
  return args[i + 1]
}
const from = valueOf('--from')
const published = valueOf('--published')
const DATE = /^\d{4}-\d{2}-\d{2}$/

const sha256 = (text) => createHash('sha256').update(text, 'utf8').digest('hex')
const addDays = (date, days) => {
  const d = new Date(`${date}T00:00:00Z`)
  d.setUTCDate(d.getUTCDate() + days)
  return d.toISOString().slice(0, 10)
}
const sqlString = (s) => `'${String(s).replaceAll("'", "''")}'`

let stale = false
const flagStale = (message) => {
  console.error(`최신이 아니다: ${message}`)
  stale = true
}
/** 쓰기(--check면 비교만) */
function output(path, text, label) {
  const current = existsSync(path) ? readFileSync(path, 'utf8') : null
  if (current === text) return
  if (check) return flagStale(label)
  mkdirSync(dirname(path), { recursive: true })
  writeFileSync(path, text)
  console.log(`썼다: ${label}`)
}

// ─ releases.json ─
const releasesFile = JSON.parse(readFileSync(releasesPath, 'utf8'))
const releases = releasesFile.releases
const releaseName = valueOf('--release') ?? releases.at(-1).dir
const target = releases.find((r) => r.dir === releaseName)
if (!target) throw new Error(`releases.json에 없는 판: ${releaseName}`)
if (published) {
  if (check) throw new Error('--published와 --check는 같이 쓰지 않는다')
  if (!DATE.test(published)) throw new Error('--published는 YYYY-MM-DD(KST)')
  target.published = published
  output(releasesPath, `${JSON.stringify(releasesFile, null, 2)}\n`, `docs/legal/releases.json(${target.dir} 게시일 ${published})`)
}
if (from) {
  if (check) throw new Error('--from과 --check는 같이 쓰지 않는다')
  if (!existsSync(from)) throw new Error(`--from 폴더가 없다: ${from}`)
  const dest = join(legalDir, target.dir)
  mkdirSync(dest, { recursive: true })
  const wanted = new Set([...Object.values(FILES), ...DOCS_ONLY])
  for (const name of readdirSync(from)) {
    if (!wanted.has(name)) continue
    copyFileSync(join(from, name), join(dest, name))
    console.log(`복사: ${name} → docs/legal/${target.dir}`)
  }
}

/** 문서 머리 줄: "버전 0.2 · 시행일 2026-11-06" */
const META = /^버전\s+(\d+(?:\.\d+)+)\s*·\s*시행일\s*(\d{4}-\d{2}-\d{2})\s*$/m

/** file → [{ version, effectiveDate, path, sha256 }] (오래된 판부터) */
const docs = Object.fromEntries(Object.keys(FILES).map((file) => [file, []]))
/** 동의 문서 행 */
const consentRows = []

for (const release of releases) {
  const { dir } = release
  if (!DATE.test(release.published ?? '')) throw new Error(`releases.json ${dir}.published가 YYYY-MM-DD가 아니다`)
  const fill = (text) =>
    text
      .replaceAll('{{시행일}}', release.published)
      .replaceAll('{{게시일}}', release.published)
      .replace(/\{\{게시일\s*\+\s*(\d+)\}\}/g, (_m, days) => addDays(release.published, Number(days)))
  const src = join(legalDir, dir)
  if (!existsSync(src)) throw new Error(`게시본 폴더가 없다: docs/legal/${dir}`)

  for (const [file, source] of Object.entries(FILES)) {
    if (!existsSync(join(src, source))) continue
    const text = fill(readFileSync(join(src, source), 'utf8'))
    if (text.includes('{{')) throw new Error(`${dir}/${source}에 채우지 않은 자리표시가 남았다`)
    const meta = META.exec(text)
    if (!meta) throw new Error(`${dir}/${source} 머리에 "버전 X · 시행일 YYYY-MM-DD" 줄이 없다`)
    const [, version, effectiveDate] = meta
    if (effectiveDate < release.published) throw new Error(`${dir}/${source} 시행일 ${effectiveDate}이 게시일 ${release.published}보다 이르다`)
    const previous = docs[file].at(-1)
    if (previous && previous.version === version) throw new Error(`${dir}/${source}가 이전 판(${previous.path})과 같은 버전 ${version}이다`)
    docs[file].push({ version, effectiveDate, path: `${dir}/${file}`, source: `docs/legal/${dir}/${source}`, sha256: sha256(text) })
    output(join(contentDir, dir, file), text, `content/${dir}/${file}`)
  }
  // 게시 목록에 없는 파일이 content/<판>에 남아 있으면 웹이 그 판을 보여 준다 — 지운 문서가 남지 않게 막는다
  if (existsSync(join(contentDir, dir))) {
    for (const name of readdirSync(join(contentDir, dir))) {
      const source = FILES[name]
      if (!source || !existsSync(join(src, source))) flagStale(`content/${dir}/${name}은 docs/legal/${dir}에 원문이 없다(지운다)`)
    }
  }

  // consents.md 1절 표: 이 판에서 새로 나온 동의 버전 → 동의 문서 행 + doc_hash 칸
  const consentsPath = join(src, 'consents.md')
  if (!existsSync(consentsPath)) continue
  const original = readFileSync(consentsPath, 'utf8')
  const lines = original.split('\n')
  const headerAt = lines.findIndex((l) => l.startsWith('| ID |') && l.includes('doc_hash'))
  if (headerAt < 0) throw new Error(`${dir}/consents.md에 동의 ID 표(| ID | … | doc_hash …)가 없다`)
  const header = lines[headerAt].split('|').map((c) => c.trim())
  const col = (pattern, required = true) => {
    const i = header.findIndex((h) => pattern.test(h))
    if (i < 0 && required) throw new Error(`${dir}/consents.md 표에 ${pattern} 열이 없다`)
    return i
  }
  const versionCol = col(/버전/)
  const hashCol = col(/doc_hash/)
  const reconsentCol = col(/재동의/, false)
  const changeCol = col(/change_type/, false)
  for (let i = headerAt + 2; i < lines.length && lines[i].startsWith('|'); i++) {
    const cells = lines[i].split('|')
    const id = /`(\w+)`/.exec(cells[1] ?? '')?.[1]
    if (!id || !CONSENTS[id]) continue
    const version = /(\d+(?:\.\d+)+)/.exec(cells[versionCol])?.[1]
    if (!version) throw new Error(`${dir}/consents.md ${id} 행에 버전이 없다`)
    const known = consentRows.some((r) => r.consentId === id && r.version === version)
    const doc = docs[CONSENTS[id].file].find((d) => d.version === version)
    if (!doc) throw new Error(`${dir}/consents.md ${id} ${version}: ${CONSENTS[id].file} ${version} 게시본이 없다`)
    // doc_hash 칸(자리 문구 또는 이전 해시)을 지금 해시로
    cells[hashCol] = ` \`${doc.sha256}\` `
    lines[i] = cells.join('|')
    if (known) continue
    // "재동의 필요" 칸: 맨 앞이 "필요 없음"이면 false, "필요"면 true. 그 밖("해당 없음(신설)" 등)은 change_type(MAJOR = true)
    const reconsentText = (reconsentCol >= 0 ? cells[reconsentCol] : '').replaceAll('*', '').trim()
    const reconsentRequired = /^필요\s*없음/.test(reconsentText)
      ? false
      : /^필요/.test(reconsentText)
        ? true
        : /MAJOR/.test(cells[changeCol] ?? '')
    consentRows.push({
      consentId: id,
      version,
      title: CONSENTS[id].title,
      required: CONSENTS[id].required,
      docPath: doc.source,
      docHash: doc.sha256,
      effectiveDate: doc.effectiveDate,
      reconsentRequired,
      replacesVersion: release.replaces?.[id] ?? null,
      summary: release.summary,
    })
  }
  const text = lines.join('\n')
  if (text !== original) output(consentsPath, text, `docs/legal/${dir}/consents.md(doc_hash)`)
}

for (const [file, versions] of Object.entries(docs)) if (versions.length === 0) throw new Error(`${file}의 게시본이 하나도 없다`)

// ─ packages/shared/src/legal-manifest.ts ─
const manifest = `// 이 파일은 apps/web/scripts/sync-legal.mjs가 만든다 — 손으로 고치지 않는다(pnpm --filter @yeojeong/web legal:sync).
// 원본: docs/legal/releases.json(게시일) · docs/legal/v<판>/(게시본, 머리 줄의 버전·시행일) · consents.md 1절 표(동의 버전·재동의 필요).

/** 판(폴더)과 게시일(KST 날짜). 문서의 {{게시일}}·{{게시일+N}}을 이 값으로 채웠다 */
export const LEGAL_RELEASES = ${JSON.stringify(
  releases.map(({ dir, published: date }) => ({ dir, published: date })),
  null,
  2,
)} as const

/** 공개 문서 한 판. 시행 시각 = effectiveDate 00:00 KST */
export interface LegalDocumentVersion {
  version: string
  effectiveDate: string
  /** 웹 content/ 아래 경로 */
  path: string
  /** 게시본(채운 웹 사본) SHA-256 */
  sha256: string
}

/** 웹 content 파일 → 판들(오래된 것부터). 판 폴더에 없는 문서는 이전 판이 현행이다 */
export const LEGAL_DOCUMENT_VERSIONS: Readonly<Record<string, readonly LegalDocumentVersion[]>> = ${JSON.stringify(
  Object.fromEntries(
    Object.entries(docs).map(([file, versions]) => [file, versions.map(({ version, effectiveDate, path, sha256: hash }) => ({ version, effectiveDate, path, sha256: hash }))]),
  ),
  null,
  2,
)}

/** 0.x 동의 문서 행(apps/api consent_documents, 마이그레이션 ${MIGRATION}과 같은 값) */
export interface LegalConsentRelease {
  consentId: 'TOS' | 'PRIVACY' | 'AGE14' | 'CARD_IMPORT'
  version: string
  title: string
  required: boolean
  docPath: string
  docHash: string
  effectiveDate: string
  /** true면 이 버전 시행부터 이전 버전 동의로는 부족하다(재동의) */
  reconsentRequired: boolean
  /** 같은 문서의 구 표기(예: 0.1 = 구 1.0). 그 표기로 받은 동의를 이 버전 동의로 본다 */
  replacesVersion: string | null
  summary: string
}

export const LEGAL_CONSENT_RELEASES: readonly LegalConsentRelease[] = ${JSON.stringify(consentRows, null, 2)}
`
output(manifestPath, manifest, 'packages/shared/src/legal-manifest.ts')

// ─ 마이그레이션 ─
const kst = (date) => `${date}T00:00:00+09:00`
const rows = consentRows
  .map(
    (r) =>
      `  (${sqlString(r.consentId)}, ${sqlString(r.version)}, ${sqlString(r.title)}, ${r.required}, ${sqlString(r.docPath)}, ${sqlString(r.docHash)}, ${sqlString(kst(r.effectiveDate))}, ${sqlString(r.reconsentRequired ? 'MAJOR' : 'MINOR')}, ${sqlString(r.summary)}, false, ${r.reconsentRequired}, ${r.replacesVersion === null ? 'NULL' : sqlString(r.replacesVersion)})`,
  )
  .join(',\n')
const migration = `-- 이 파일은 apps/web/scripts/sync-legal.mjs가 만든다 — 손으로 고치지 않는다. 운영에 적용한 뒤에는 고치지 말고 새 마이그레이션으로 낸다.
-- 약관·동의 문서 버전을 0.x로 다시 매긴다(L-1b). 게시본 1.0 = 0.1(시행 2026-10-30 그대로), 다음 판 0.2(docs/legal/releases.json).
-- 1) 재동의 판정을 버전 번호(MAJOR 비교)가 아니라 버전별 reconsent_required로 한다(0.x는 MAJOR가 늘 0). 기존 행은 change_type으로 채운다.
-- 2) replaces_version: 같은 문서의 구 표기. 0.1 행은 구 1.0을 대신한다 — 1.0으로 받은 동의(user_consents.version = '1.0')를 0.1 동의로 본다.
--    user_consents는 고치지 않는다(append-only 동의 증거: 당시 버전 표기·당시 문서 해시 그대로). 1.0 행도 지우지 않는다(당시 게시 기록).
-- 3) 0.x 행: doc_hash = 게시본(apps/web/src/features/legal/content/v<판>/*.md, 게시일을 채운 것) SHA-256. change_type은 기록용(reconsent_required와 같게).
ALTER TABLE "consent_documents" ADD COLUMN "reconsent_required" BOOLEAN;
UPDATE "consent_documents" SET "reconsent_required" = ("change_type" = 'MAJOR');
ALTER TABLE "consent_documents" ALTER COLUMN "reconsent_required" SET NOT NULL;
ALTER TABLE "consent_documents" ADD COLUMN "replaces_version" VARCHAR(16);

INSERT INTO "consent_documents" ("consent_id", "version", "title", "required", "doc_path", "doc_hash", "effective_at", "change_type", "summary", "is_draft", "reconsent_required", "replaces_version")
VALUES
${rows}
ON CONFLICT ("consent_id", "version") DO NOTHING;
`
output(migrationPath, migration, `apps/api/prisma/migrations/${MIGRATION}/migration.sql`)

for (const [file, versions] of Object.entries(docs)) {
  console.log(`${file}: ${versions.map((v) => `${v.version}(${v.effectiveDate}, ${v.path}, ${v.sha256.slice(0, 12)}…)`).join(' → ')}`)
}
for (const r of consentRows) {
  console.log(`동의 ${r.consentId} ${r.version}: 시행 ${r.effectiveDate} · 재동의 ${r.reconsentRequired ? '필요' : '없음'}${r.replacesVersion ? ` · 구 ${r.replacesVersion}` : ''} · ${r.docHash}`)
}
if (check && stale) {
  console.error('pnpm --filter @yeojeong/web legal:sync 를 실행한다')
  process.exit(1)
}
