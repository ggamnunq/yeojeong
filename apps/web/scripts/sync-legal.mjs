// 약관 게시본(docs/legal/v1.0) → src/features/legal/content 복사. 원문을 고친 뒤 다시 돌리면 된다.
//   pnpm --filter @yeojeong/web legal:sync                 # 레포의 docs/legal/v1.0 기준
//   pnpm --filter @yeojeong/web legal:sync -- --from <dir> # 다른 곳(작성 세션의 사본)을 먼저 docs/legal/v1.0으로 복사
//   pnpm --filter @yeojeong/web legal:sync -- --check      # 파일을 쓰지 않고 content가 최신인지만 확인(다르면 exit 1)
//
// 하는 일
// 1. 게시 문서의 `{{시행일}}`을 EFFECTIVE_DATE로 채운다(docs/legal/v1.0 원문에도 같이 반영 — 게시본 = 레포 원문).
// 2. content/<file>.md로 복사하고 SHA-256을 출력한다. 동의 문서(TOS·PRIVACY·AGE14)의 해시는
//    consents.md 1절 표와 apps/api 동의 문서 마이그레이션(consent_documents 1.0 행)에 그대로 들어가야 한다
//    (apps/api/src/common/auth/consent-catalog.spec.ts가 content 파일로 다시 계산해 대조한다).
// 3. consents.md 1절 표의 doc_hash 칸을 채운다.
// 초안(docs/legal/*.md, v1.0 밖)은 읽지도 복사하지도 않는다 — 공개 레포에 올리지 않는다.
import { createHash } from 'node:crypto'
import { copyFileSync, existsSync, readdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

/** 시행일(약관 부칙·처리방침 제14조①·각 문서 머리). 개정판을 낼 때 VERSION_DIR과 함께 바꾼다 */
export const EFFECTIVE_DATE = '2026-10-30'
const VERSION_DIR = 'v1.0'

const here = dirname(fileURLToPath(import.meta.url))
const repo = resolve(here, '../../..')
const src = join(repo, 'docs/legal', VERSION_DIR)
const to = join(here, '../src/features/legal/content')

// src/features/legal/docs.ts의 file ↔ source와 같게 둔다
export const FILES = {
  'terms.md': '서비스 이용약관.md',
  'privacy.md': '개인정보처리방침.md',
  'consent-collection.md': '개인정보 수집·이용 동의서.md',
  'processors.md': '개인정보 처리위탁 고지.md',
  'licenses.md': '오픈소스 및 라이선스 고지.md',
}
/** 레포에만 두고 웹에는 게시하지 않는 개발용 문서 */
const DOCS_ONLY = ['consents.md', 'README.md']

const args = process.argv.slice(2)
const check = args.includes('--check')
const fromIndex = args.indexOf('--from')
const from = fromIndex >= 0 ? args[fromIndex + 1] : null

const sha256 = (text) => createHash('sha256').update(text, 'utf8').digest('hex')
const fill = (text) => text.replaceAll('{{시행일}}', EFFECTIVE_DATE)

if (from) {
  if (check) throw new Error('--from과 --check는 같이 쓰지 않는다')
  if (!existsSync(from)) throw new Error(`--from 폴더가 없다: ${from}`)
  const wanted = new Set([...Object.values(FILES), ...DOCS_ONLY])
  for (const name of readdirSync(from)) {
    if (!wanted.has(name)) continue
    copyFileSync(join(from, name), join(src, name))
    console.log(`복사: ${name}`)
  }
}

if (!existsSync(src)) {
  console.error(`게시본 폴더가 없다: docs/legal/${VERSION_DIR}`)
  process.exit(1)
}

let stale = false
const hashes = {}
for (const [file, source] of Object.entries(FILES)) {
  const original = readFileSync(join(src, source), 'utf8')
  const text = fill(original)
  if (text.includes('{{')) throw new Error(`${source}에 채우지 않은 자리표시가 남았다`)
  hashes[source] = sha256(text)
  const target = join(to, file)
  const current = existsSync(target) ? readFileSync(target, 'utf8') : null
  if (check) {
    if (current !== text || original !== text) {
      console.error(`최신이 아니다: content/${file} ← ${source}`)
      stale = true
    }
    continue
  }
  if (original !== text) writeFileSync(join(src, source), text)
  if (current !== text) writeFileSync(target, text)
  console.log(`${source} → content/${file}  sha256 ${hashes[source]}`)
}

// consents.md: 시행일·doc_hash 칸(1절 표). AGE14는 근거 조항(제7조)이 있는 이용약관 파일의 해시를 쓴다
const consentsPath = join(src, 'consents.md')
if (existsSync(consentsPath)) {
  const terms = hashes['서비스 이용약관.md']
  const privacy = hashes['개인정보 수집·이용 동의서.md']
  const rowHash = { TOS: terms, PRIVACY: privacy, AGE14: terms }
  const original = readFileSync(consentsPath, 'utf8')
  const text = fill(original)
    .replace(`\`${EFFECTIVE_DATE}\`(개발 세션이 게시일 입력)`, `\`${EFFECTIVE_DATE}\``)
    .split('\n')
    .map((line) => {
      const id = /^\| `(TOS|PRIVACY|AGE14)` \|/.exec(line)?.[1]
      if (!id) return line
      const cells = line.split(' | ')
      // doc_hash 칸: 자리 문구 또는 이전 해시를 지금 해시로 바꾼다
      const at = cells.findIndex((c) => /^\(개발 세션|^\(TOS 파일과 같은 값|^`[0-9a-f]{64}`$/.test(c))
      if (at >= 0) cells[at] = `\`${rowHash[id]}\``
      return cells.join(' | ')
    })
    .join('\n')
  if (check) {
    if (text !== original) {
      console.error('최신이 아니다: consents.md(시행일·doc_hash)')
      stale = true
    }
  } else if (text !== original) {
    writeFileSync(consentsPath, text)
    console.log('consents.md 시행일·doc_hash 갱신')
  }
}

// README.md(로컬 전용, .gitignore): 머리 줄의 시행일만 채운다(5절 "남은 자리표시" 표는 자리표시 설명이라 그대로 둔다)
const readmePath = join(src, 'README.md')
if (existsSync(readmePath)) {
  const original = readFileSync(readmePath, 'utf8')
  const text = original.replace('시행일 `{{시행일}}`(개발 세션이 게시일 입력)', `시행일 \`${EFFECTIVE_DATE}\``)
  if (check && text !== original) {
    console.error('최신이 아니다: README.md(시행일)')
    stale = true
  } else if (!check && text !== original) writeFileSync(readmePath, text)
}

if (check && stale) {
  console.error('pnpm --filter @yeojeong/web legal:sync 를 실행한다')
  process.exit(1)
}
