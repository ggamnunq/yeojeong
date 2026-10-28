// docs/legal 문서용 작은 마크다운 파서. HTML은 해석하지 않는다(렌더러가 글자로 그린다).
// # 제목(1~4) · > 인용 · --- 구분선 · | 표 | · 목록(1. · - · 가. · 들여쓰기) · 문단

export type MarkdownBlock =
  | { kind: 'heading'; level: 1 | 2 | 3 | 4; text: string }
  | { kind: 'quote'; lines: string[] }
  | { kind: 'rule' }
  | { kind: 'table'; head: string[]; rows: string[][] }
  | { kind: 'list'; items: { depth: number; text: string }[] }
  | { kind: 'paragraph'; text: string }

const LIST_ITEM = /^(\s*)((?:\d+\.|[-*]|[가-힣]\.)\s+.*)$/
const cells = (line: string) =>
  line
    .trim()
    .replace(/^\||\|$/g, '')
    .split('|')
    .map((c) => c.trim())

export function parseMarkdown(source: string): MarkdownBlock[] {
  const lines = source.replace(/\r\n?/g, '\n').split('\n')
  const blocks: MarkdownBlock[] = []
  let i = 0
  while (i < lines.length) {
    const line = lines[i]
    const trimmed = line.trim()
    if (trimmed === '') {
      i++
    } else if (/^-{3,}$/.test(trimmed)) {
      blocks.push({ kind: 'rule' })
      i++
    } else if (/^#{1,4}\s/.test(trimmed)) {
      const [, hashes, text] = /^(#{1,4})\s+(.*)$/.exec(trimmed)!
      blocks.push({ kind: 'heading', level: hashes.length as 1 | 2 | 3 | 4, text })
      i++
    } else if (trimmed.startsWith('>')) {
      const quote: string[] = []
      while (i < lines.length && lines[i].trim().startsWith('>')) quote.push(lines[i++].trim().replace(/^>\s?/, ''))
      blocks.push({ kind: 'quote', lines: quote })
    } else if (trimmed.startsWith('|')) {
      const rows: string[][] = []
      while (i < lines.length && lines[i].trim().startsWith('|')) rows.push(cells(lines[i++]))
      const body = rows.slice(1).filter((r) => !r.every((c) => /^:?-+:?$/.test(c)))
      blocks.push({ kind: 'table', head: rows[0], rows: body })
    } else if (LIST_ITEM.test(line)) {
      const items: { depth: number; text: string }[] = []
      while (i < lines.length && LIST_ITEM.test(lines[i])) {
        const [, indent, text] = LIST_ITEM.exec(lines[i++])!
        items.push({ depth: Math.min(2, Math.floor(indent.length / 2)), text })
      }
      blocks.push({ kind: 'list', items })
    } else {
      const text: string[] = []
      while (i < lines.length && lines[i].trim() !== '' && !isBlockStart(lines[i])) text.push(lines[i++].trim())
      blocks.push({ kind: 'paragraph', text: text.join(' ') })
    }
  }
  return blocks
}

function isBlockStart(line: string) {
  const t = line.trim()
  return /^(#{1,4}\s|>|\||-{3,}$)/.test(t) || LIST_ITEM.test(line)
}
