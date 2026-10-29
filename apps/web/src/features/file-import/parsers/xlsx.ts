import { unzipSync } from 'fflate'
import { StatementFileError, type SheetRows } from './types'

// 최소 xlsx 읽기(첫 시트의 값만). 압축 해제는 fflate(의존성 없음), XML은 브라우저 DOMParser.
// 서식·수식·스타일은 읽지 않는다. 수식 칸은 저장된 결과 값(<v>)만 쓴다.
// 방어: 압축 해제 전 선언 크기로 상한(zip bomb), DOCTYPE·ENTITY가 있는 XML 거절(엔티티 확장), 항목 수 상한.

/** 압축을 푼 한 항목의 상한(바이트)과 필요한 항목 합계 상한 */
export const MAX_ENTRY_BYTES = 20 * 1024 * 1024
const MAX_TOTAL_BYTES = 40 * 1024 * 1024
const MAX_ENTRIES = 2_000
/** 압축 비율 상한(풀린 크기 ÷ 압축 크기). 정상 xlsx 시트 XML은 10~20배 안팎이다. 1MB 넘게 풀리는 항목에만 본다(작은 항목은 비율이 커도 무해) */
export const MAX_COMPRESSION_RATIO = 100
const RATIO_CHECK_FROM = 1024 * 1024

/** 압축 파일 머리(PK\x03\x04) */
export const isZip = (bytes: Uint8Array) => bytes[0] === 0x50 && bytes[1] === 0x4b && bytes[2] === 0x03 && bytes[3] === 0x04
/** OLE 복합 문서(D0 CF 11 E0): 암호 걸린 Excel·옛 xls */
export const isOle = (bytes: Uint8Array) => bytes[0] === 0xd0 && bytes[1] === 0xcf && bytes[2] === 0x11 && bytes[3] === 0xe0

type Entry = { name: string; size: number; originalSize: number }

function listEntries(bytes: Uint8Array): Entry[] {
  const entries: Entry[] = []
  try {
    // filter가 false를 돌려주면 압축을 풀지 않는다 — 이름·선언 크기만 본다
    unzipSync(bytes, {
      filter: (file) => {
        entries.push({ name: file.name, size: file.size, originalSize: file.originalSize })
        if (entries.length > MAX_ENTRIES) throw new StatementFileError('format')
        return false
      },
    })
  } catch (error) {
    if (error instanceof StatementFileError) throw error
    throw new StatementFileError('format')
  }
  return entries
}

function extract(bytes: Uint8Array, wanted: readonly string[], entries: readonly Entry[]): Record<string, string> {
  const present = entries.filter((e) => wanted.includes(e.name))
  const total = present.reduce((sum, e) => sum + e.originalSize, 0)
  if (present.some((e) => e.originalSize > MAX_ENTRY_BYTES) || total > MAX_TOTAL_BYTES) throw new StatementFileError('tooLarge')
  // zip bomb: 선언 크기 대비 압축 비율이 비정상이면 풀지 않는다
  if (present.some((e) => e.originalSize > RATIO_CHECK_FROM && e.originalSize > Math.max(e.size, 1) * MAX_COMPRESSION_RATIO)) {
    throw new StatementFileError('format')
  }
  let files: Record<string, Uint8Array>
  try {
    files = unzipSync(bytes, { filter: (file) => wanted.includes(file.name) })
  } catch {
    throw new StatementFileError('format')
  }
  const decoder = new TextDecoder('utf-8')
  return Object.fromEntries(Object.entries(files).map(([name, data]) => [name, decoder.decode(data)]))
}

function parseXml(text: string): Document {
  // 엔티티 확장·외부 참조를 아예 받지 않는다(xlsx 표준 파일에는 DOCTYPE이 없다)
  if (/<!DOCTYPE|<!ENTITY/i.test(text)) throw new StatementFileError('format')
  const doc = new DOMParser().parseFromString(text, 'application/xml')
  if (doc.getElementsByTagName('parsererror').length > 0) throw new StatementFileError('format')
  return doc
}

const byLocalName = (root: Document | Element, name: string) => Array.from(root.getElementsByTagNameNS('*', name))

/** 첫 시트 경로: workbook.xml 첫 <sheet>의 r:id → workbook.xml.rels Target. 못 찾으면 sheet1 */
function firstSheetPath(workbook: string | undefined, rels: string | undefined, entries: readonly Entry[]): string | null {
  const names = new Set(entries.map((e) => e.name))
  if (workbook && rels) {
    const sheet = byLocalName(parseXml(workbook), 'sheet')[0]
    const rid = sheet ? Array.from(sheet.attributes).find((a) => a.localName === 'id')?.value : undefined
    const rel = rid ? byLocalName(parseXml(rels), 'Relationship').find((r) => r.getAttribute('Id') === rid) : undefined
    const target = rel?.getAttribute('Target')
    if (target) {
      const path = target.startsWith('/') ? target.slice(1) : `xl/${target.replace(/^\.\//, '')}`
      if (names.has(path)) return path
    }
  }
  if (names.has('xl/worksheets/sheet1.xml')) return 'xl/worksheets/sheet1.xml'
  return (
    entries
      .map((e) => e.name)
      .filter((n) => /^xl\/worksheets\/[^/]+\.xml$/.test(n))
      .sort()[0] ?? null
  )
}

/** <si> → 문자열(서식 있는 글자 조각 <r><t>를 잇는다, 읽는 법 <rPh>는 뺀다) */
function sharedStrings(xml: string | undefined): string[] {
  if (!xml) return []
  return byLocalName(parseXml(xml), 'si').map((si) =>
    byLocalName(si, 't')
      .filter((t) => (t.parentElement?.localName ?? '') !== 'rPh')
      .map((t) => t.textContent ?? '')
      .join(''),
  )
}

/** "AB12" → 27(0부터) */
function columnIndex(ref: string | null): number | null {
  const letters = ref?.match(/^[A-Z]+/i)?.[0]
  if (!letters) return null
  let n = 0
  for (const ch of letters.toUpperCase()) n = n * 26 + (ch.charCodeAt(0) - 64)
  return n - 1
}

/**
 * xlsx 바이트 → 첫 시트의 행(값은 문자열).
 * xlsx가 아닌 zip: 다른 Office 문서(docx 등)면 format, 그 밖(위챗이 보내는 암호 압축·파일을 담은 압축)이면 archive — 풀고 올려야 한다
 */
export function readXlsxRows(bytes: Uint8Array, maxRows: number): SheetRows {
  const entries = listEntries(bytes)
  const names = new Set(entries.map((e) => e.name))
  if (!names.has('xl/workbook.xml')) throw new StatementFileError(names.has('[Content_Types].xml') ? 'format' : 'archive')
  const meta = extract(bytes, ['xl/workbook.xml', 'xl/_rels/workbook.xml.rels'], entries)
  const sheetPath = firstSheetPath(meta['xl/workbook.xml'], meta['xl/_rels/workbook.xml.rels'], entries)
  if (!sheetPath) throw new StatementFileError('format')
  const files = extract(bytes, [sheetPath, 'xl/sharedStrings.xml'], entries)
  const strings = sharedStrings(files['xl/sharedStrings.xml'])
  const sheetXml = files[sheetPath]
  if (!sheetXml) throw new StatementFileError('format')

  const rows: SheetRows = []
  for (const rowEl of byLocalName(parseXml(sheetXml), 'row')) {
    const row: string[] = []
    let next = 0
    for (const c of Array.from(rowEl.children).filter((el) => el.localName === 'c')) {
      const col = columnIndex(c.getAttribute('r')) ?? next
      next = col + 1
      if (col > 200) continue
      const type = c.getAttribute('t')
      const v = Array.from(c.children).find((el) => el.localName === 'v')?.textContent ?? ''
      let value: string
      if (type === 's') value = strings[Number(v)] ?? ''
      else if (type === 'inlineStr') {
        const is = Array.from(c.children).find((el) => el.localName === 'is')
        value = is ? byLocalName(is, 't').map((t) => t.textContent ?? '').join('') : ''
      } else value = v
      while (row.length < col) row.push('')
      row[col] = value
    }
    if (row.some((cell) => cell.trim() !== '')) {
      rows.push(row)
      if (rows.length > maxRows) throw new StatementFileError('tooLarge')
    }
  }
  return rows
}
