import { StatementFileError, type SheetRows } from './types'

// 예전 위챗 CSV · 알리페이 CSV(UTF-8 BOM · UTF-8 · GBK/GB18030). 인코딩을 고른 뒤 RFC 4180 규칙(따옴표 안 쉼표·줄바꿈·"" 이스케이프)으로 나눈다.

/** 바이트 → 문자열. BOM이 있으면 그 인코딩, 없으면 UTF-8(엄격) → 실패하면 GB18030(GBK 상위 집합) */
export function decodeText(bytes: Uint8Array): string {
  if (bytes[0] === 0xef && bytes[1] === 0xbb && bytes[2] === 0xbf) return new TextDecoder('utf-8').decode(bytes.subarray(3))
  if (bytes[0] === 0xff && bytes[1] === 0xfe) return new TextDecoder('utf-16le').decode(bytes.subarray(2))
  if (bytes[0] === 0xfe && bytes[1] === 0xff) return new TextDecoder('utf-16be').decode(bytes.subarray(2))
  try {
    return new TextDecoder('utf-8', { fatal: true }).decode(bytes)
  } catch {
    try {
      return new TextDecoder('gb18030', { fatal: true }).decode(bytes)
    } catch {
      throw new StatementFileError('format')
    }
  }
}

/** 한 행의 칸 상한(xlsx 읽기의 열 상한과 같다). 넘으면 거래 내역 파일이 아니다(format) — 쉼표만 수만 개인 줄이 메모리를 키우지 못하게 */
export const MAX_ROW_CELLS = 200

/** CSV 문자열 → 행. 빈 줄은 뺀다. maxRows를 넘으면 tooLarge, 한 행이 MAX_ROW_CELLS칸을 넘으면 format */
export function parseCsv(text: string, maxRows: number): SheetRows {
  const rows: SheetRows = []
  let row: string[] = []
  let field = ''
  let quoted = false
  const endField = () => {
    row.push(field)
    field = ''
    if (row.length > MAX_ROW_CELLS) throw new StatementFileError('format')
  }
  const endRow = () => {
    endField()
    if (row.some((cell) => cell.trim() !== '')) {
      rows.push(row)
      if (rows.length > maxRows) throw new StatementFileError('tooLarge')
    }
    row = []
  }
  for (let i = 0; i < text.length; i++) {
    const ch = text[i]
    if (quoted) {
      if (ch === '"') {
        if (text[i + 1] === '"') {
          field += '"'
          i++
        } else quoted = false
      } else field += ch
    } else if (ch === '"' && field.trim() === '') {
      field = ''
      quoted = true
    } else if (ch === ',') endField()
    else if (ch === '\n') endRow()
    else if (ch === '\r') {
      if (text[i + 1] === '\n') i++
      endRow()
    } else field += ch
  }
  if (field !== '' || row.length > 0) endRow()
  return rows
}
