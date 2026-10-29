// docs/legal 문서 → 문서 트리. HTML은 해석하지 않는다(렌더러가 글자로 그린다).
// 구조: 제목(# h1) · 머리 인용(시행일·버전) · 장(제N장) · 조(제N조(제목)) · 절(1. · 4-1.) · 항(①) · 호(1.) · 목(가.) · 표 · 목록 · 문단.
// 게시 규칙(docs/legal README 2절): 머리 인용(문서 상태 메모) · `> [검토]` 줄 · 문장 끝 `[검토]` · "게시하지 않음" 절은 빼고 만든다.

export type LegalListItem = {
  /** 화면에 그대로 보이는 번호: "1." · "가." · 글머리 기호면 null */
  marker: string | null
  text: string
  children: LegalListItem[]
}

export type LegalBlock =
  | { kind: 'paragraph'; text: string }
  /** 항(①). 바로 뒤 호·표는 그 항 안에 둔다 */
  | { kind: 'clause'; marker: string; text: string; blocks: LegalBlock[] }
  | { kind: 'list'; ordered: boolean; items: LegalListItem[] }
  | { kind: 'table'; head: string[]; rows: string[][] }
  | { kind: 'quote'; lines: string[] }
  | { kind: 'code'; text: string }

export type LegalSectionKind = 'chapter' | 'article' | 'section'

export type LegalSection = {
  kind: LegalSectionKind
  /** 문서 안 앵커: chapter-1 · article-3 · section-4-1 · 번호 없는 절 part-1 */
  id: string
  heading: string
  blocks: LegalBlock[]
  sections: LegalSection[]
}

export type LegalDocument = {
  /** # 제목. 화면은 헤더에 문서명을 따로 보여 주므로 본문에 그리지 않는다 */
  title: string | null
  /** 머리 인용의 시행일(YYYY-MM-DD). 아직 정하지 않았으면({{시행일}}) null */
  effectiveDate: string | null
  /** 머리 인용의 버전("0.1"). 없으면 null */
  version: string | null
  /** 첫 절 앞 본문(처리방침 머리말 등) */
  intro: LegalBlock[]
  sections: LegalSection[]
}

type Token = { type: 'heading'; level: number; text: string } | { type: 'block'; block: LegalBlock }

const CLAUSE = /^([①-⑳])\s*(.*)$/
const LIST_ITEM = /^(\s*)(\d+\.|[-*]|[가-힣]\.)\s+(.*)$/
const HEADING = /^(#{1,4})\s+(.*)$/
const REVIEW_MARK = /\s*\[검토\]/g
const HIDDEN_SECTION = /게시하지 않음/
const DATE = /시행일\s*`?(\d{4}-\d{2}-\d{2})/
const VERSION = /v(\d+(?:\.\d+)+)/

/** 문장 끝 `[검토]` 표시를 지운다 */
export const stripReview = (text: string) => text.replace(REVIEW_MARK, '').trim()

const cells = (line: string) =>
  line
    .trim()
    .replace(/^\||\|$/g, '')
    .split('|')
    .map((c) => stripReview(c))

function isBlockStart(line: string) {
  const t = line.trim()
  return /^(#{1,4}\s|>|\||-{3,}$|```|<\/?details>|<summary>)/.test(t) || LIST_ITEM.test(line)
}

/** 들여쓰기로 호·목을 중첩한다 */
function nestItems(flat: { indent: number; marker: string | null; text: string }[]): LegalListItem[] {
  const root: LegalListItem[] = []
  const stack: { indent: number; item: LegalListItem }[] = []
  for (const { indent, marker, text } of flat) {
    const item: LegalListItem = { marker, text, children: [] }
    while (stack.length > 0 && stack.at(-1)!.indent >= indent) stack.pop()
    ;(stack.at(-1)?.item.children ?? root).push(item)
    stack.push({ indent, item })
  }
  return root
}

function tokenize(source: string): { tokens: Token[]; quotes: Map<Token, string[]> } {
  const lines = source.replace(/\r\n?/g, '\n').split('\n')
  const tokens: Token[] = []
  // 머리 인용은 걸러진 줄이 아니라 원래 줄로 시행일·버전을 읽는다
  const quotes = new Map<Token, string[]>()
  let i = 0
  while (i < lines.length) {
    const line = lines[i]
    const t = line.trim()
    if (t === '' || /^-{3,}$/.test(t) || /^<\/?details>$/.test(t)) {
      i++
    } else if (HEADING.test(t)) {
      const [, hashes, text] = HEADING.exec(t)!
      tokens.push({ type: 'heading', level: hashes.length, text: stripReview(text) })
      i++
    } else if (t.startsWith('```')) {
      const code: string[] = []
      i++
      while (i < lines.length && !lines[i].trim().startsWith('```')) code.push(lines[i++])
      i++
      tokens.push({ type: 'block', block: { kind: 'code', text: code.join('\n') } })
    } else if (/^<summary>.*<\/summary>$/.test(t)) {
      tokens.push({ type: 'block', block: { kind: 'paragraph', text: `**${t.replace(/<\/?summary>/g, '')}**` } })
      i++
    } else if (t.startsWith('>')) {
      const raw: string[] = []
      while (i < lines.length && lines[i].trim().startsWith('>')) raw.push(lines[i++].trim().replace(/^>\s?/, ''))
      // 검토자용 메모 줄은 게시하지 않는다
      const kept = raw.filter((l) => l.trim() !== '' && !l.trim().startsWith('[검토]')).map(stripReview)
      const token: Token = { type: 'block', block: { kind: 'quote', lines: kept } }
      quotes.set(token, raw)
      tokens.push(token)
    } else if (t.startsWith('|')) {
      const rows: string[][] = []
      while (i < lines.length && lines[i].trim().startsWith('|')) rows.push(cells(lines[i++]))
      const body = rows.slice(1).filter((r) => !r.every((c) => /^:?-+:?$/.test(c)))
      tokens.push({ type: 'block', block: { kind: 'table', head: rows[0], rows: body } })
    } else if (LIST_ITEM.test(line)) {
      const flat: { indent: number; marker: string | null; text: string }[] = []
      while (i < lines.length && LIST_ITEM.test(lines[i])) {
        const [, indent, marker, text] = LIST_ITEM.exec(lines[i++])!
        flat.push({ indent: indent.length, marker: /^[-*]$/.test(marker) ? null : marker, text: stripReview(text) })
      }
      tokens.push({ type: 'block', block: { kind: 'list', ordered: flat[0].marker !== null, items: nestItems(flat) } })
    } else {
      const text: string[] = []
      while (i < lines.length && lines[i].trim() !== '' && !isBlockStart(lines[i])) text.push(lines[i++].trim())
      const joined = stripReview(text.join(' '))
      const clause = CLAUSE.exec(joined)
      tokens.push({
        type: 'block',
        block: clause ? { kind: 'clause', marker: clause[1], text: clause[2], blocks: [] } : { kind: 'paragraph', text: joined },
      })
    }
  }
  return { tokens, quotes }
}

function sectionOf(heading: string, used: Set<string>, counter: { plain: number }): LegalSection {
  const chapter = /^제(\d+)장/.exec(heading)
  const article = /^제(\d+)조/.exec(heading)
  const numbered = /^(\d+(?:-\d+)*)\./.exec(heading)
  const kind: LegalSectionKind = chapter ? 'chapter' : article ? 'article' : 'section'
  let id = chapter
    ? `chapter-${chapter[1]}`
    : article
      ? `article-${article[1]}`
      : numbered
        ? `section-${numbered[1]}`
        : `part-${++counter.plain}`
  // 부칙의 제1조처럼 번호가 겹치면 뒤에 순번을 붙인다
  if (used.has(id)) {
    let n = 2
    while (used.has(`${id}-${n}`)) n++
    id = `${id}-${n}`
  }
  used.add(id)
  return { kind, id, heading, blocks: [], sections: [] }
}

/** 항(①) 바로 뒤의 호·표·코드는 그 항에 넣는다 */
function append(blocks: LegalBlock[], block: LegalBlock) {
  const last = blocks.at(-1)
  if (last?.kind === 'clause' && (block.kind === 'list' || block.kind === 'table' || block.kind === 'code')) last.blocks.push(block)
  else blocks.push(block)
}

/**
 * 게시 전 자리표시자(`{{사업자명}}` 등, docs/legal README 4절). 값이 정해진 것은 여기서 채우고, 정해지지 않은 것은
 * 화면에 `{{…}}`가 그대로 보이지 않게 지운다(QA HF-30). 값이 정해지면 원문에서 치환하는 것이 원칙이다.
 */
export const LEGAL_PLACEHOLDER_VALUES: Readonly<Record<string, string>> = {}

export function fillPlaceholders(source: string, values: Readonly<Record<string, string>> = LEGAL_PLACEHOLDER_VALUES): string {
  return source.replace(/\{\{\s*([^}]+?)\s*\}\}/g, (_match, key: string) => values[key] ?? '').replace(/[ \t]{2,}/g, ' ')
}

export function parseLegal(source: string): LegalDocument {
  const { tokens, quotes } = tokenize(fillPlaceholders(source))
  const doc: LegalDocument = { title: null, effectiveDate: null, version: null, intro: [], sections: [] }
  const used = new Set<string>()
  const stack: { level: number; section: LegalSection }[] = []
  /** 이 수준 이하 제목이 나올 때까지 건너뛴다("게시하지 않음" 절) */
  let hiddenLevel: number | null = null
  let seenSection = false
  let metaRead = false
  /** 번호 없는 절(부칙·한눈에 보기)의 순번 */
  const counter = { plain: 0 }

  for (const token of tokens) {
    if (token.type === 'heading') {
      if (token.level === 1) {
        doc.title ??= token.text
        continue
      }
      if (hiddenLevel !== null && token.level > hiddenLevel) continue
      hiddenLevel = null
      if (HIDDEN_SECTION.test(token.text)) {
        hiddenLevel = token.level
        continue
      }
      seenSection = true
      const section = sectionOf(token.text, used, counter)
      while (stack.length > 0 && stack.at(-1)!.level >= token.level) stack.pop()
      ;(stack.at(-1)?.section.sections ?? doc.sections).push(section)
      stack.push({ level: token.level, section })
      continue
    }
    if (hiddenLevel !== null) continue
    const raw = quotes.get(token)
    if (raw && !seenSection && !metaRead) {
      // 머리 인용 = 문서 상태 메모(동의 ID·게시 전 할 일). 시행일·버전만 읽고 본문에는 넣지 않는다
      metaRead = true
      const text = raw.join(' ')
      doc.effectiveDate = DATE.exec(text)?.[1] ?? null
      doc.version = VERSION.exec(text)?.[1] ?? null
      continue
    }
    if (token.block.kind === 'quote' && token.block.lines.length === 0) continue
    append(stack.at(-1)?.section.blocks ?? doc.intro, token.block)
  }
  return doc
}
