import type { FileImportProvider } from '@yeojeong/shared'
import { decodeText, parseCsv } from './csv'
import { MAX_DATA_ROWS, MAX_FILE_BYTES, StatementFileError, type ParsedStatement, type SheetRows, type StatementParser } from './types'
import { alipayParser } from './alipay'
import { wechatParser } from './wechat'
import { isOle, isZip, readXlsxRows } from './xlsx'

// 거래 내역 파일 읽기 진입점(화면이 지연 로딩한다 — import('./parsers')).
// 파일 → (xlsx | CSV) 표 → 공급자 해석기 → StatementItem[]. 파일 바이트·표는 이 함수 안 지역 변수로만 있고 끝나면 버린다.
// 공급자를 붙일 때: parsers/<provider>.ts에 StatementParser를 만들고 아래 PARSERS에 더한다(위챗 W10 · 알리페이 W11).

const PARSERS: Record<FileImportProvider, StatementParser> = {
  WECHAT: wechatParser,
  ALIPAY: alipayParser,
}

/** 요약 블록 줄을 넉넉히 더한 표 행 상한 */
const MAX_SHEET_ROWS = MAX_DATA_ROWS + 200

/** 바이트 → 표. zip이면 xlsx(아니면 archive), OLE(암호 Excel·옛 xls)면 archive, 그 밖은 글자(CSV) */
export function readSheet(bytes: Uint8Array): SheetRows {
  if (bytes.length === 0) throw new StatementFileError('format')
  if (bytes.length > MAX_FILE_BYTES) throw new StatementFileError('tooLarge')
  if (isZip(bytes)) return readXlsxRows(bytes, MAX_SHEET_ROWS)
  if (isOle(bytes)) throw new StatementFileError('archive')
  // 글자 파일이 아닌 것(이미지·PDF 등)은 헤더를 못 찾아 format이 된다
  return parseCsv(decodeText(bytes), MAX_SHEET_ROWS)
}

/** 파일 → 정규화 결과. 실패하면 StatementFileError(그 밖의 예외도 format으로 바꾼다) */
export async function parseStatementFile(provider: FileImportProvider, file: Blob): Promise<ParsedStatement> {
  if (file.size > MAX_FILE_BYTES) throw new StatementFileError('tooLarge')
  try {
    const rows = readSheet(new Uint8Array(await file.arrayBuffer()))
    return await PARSERS[provider].parseRows(rows)
  } catch (error) {
    if (error instanceof StatementFileError) throw error
    throw new StatementFileError('format')
  }
}

export { StatementFileError }
export type { ParsedStatement }
