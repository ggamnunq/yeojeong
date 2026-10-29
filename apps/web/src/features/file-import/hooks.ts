import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  FILE_IMPORT_CHECK_MAX,
  FILE_IMPORT_ITEMS_MAX,
  type FileImportItem,
  type FileImportProvider,
  type FileImportResponse,
} from '@yeojeong/shared'
import type { SessionResponse } from '../../api'
import { sessionQuery } from '../../app/session'
import { invalidateManual } from '../manual/api'
import { checkFileImport, importFileEntries } from './api'
import type { StatementItem } from './parsers/types'
import { chunk } from './rules'

/** features.fileImport(GET /auth/session). 값이 없거나 true가 아니면 false(fail closed) */
export function fileImportOf(session: SessionResponse | undefined | null): boolean {
  return session?.features?.fileImport === true
}

/** 지갑의 "위챗페이 파일 가져오기" 진입점을 보일지. 세션 쿼리 캐시만 읽는다 */
export function useFileImportEnabled(): boolean {
  const { data } = useQuery({ ...sessionQuery(), enabled: false })
  return fileImportOf(data)
}

/** "추가됨" 대조를 상한씩 나눠 묻고 순서대로 잇는다. **대조값(txnDigest)만** 보낸다(일시·금액·가맹점 없음 — 명세 4-13-7) */
export async function checkAll(provider: FileImportProvider, items: readonly StatementItem[], signal?: AbortSignal): Promise<boolean[]> {
  const out: boolean[] = []
  for (const part of chunk(items, FILE_IMPORT_CHECK_MAX)) {
    const res = await checkFileImport({ provider, txnDigests: part.map((i) => i.txnDigest) }, signal)
    out.push(...res.imported)
  }
  return out
}

/** 고른 결제 저장. 상한(200건)씩 나눠 보내고 합친다 — 다시 보내도 같은 거래는 건너뛴다(서버 importKey) */
export function useSaveFileImport() {
  const client = useQueryClient()
  return useMutation({
    mutationFn: async ({ provider, items }: { provider: FileImportProvider; items: FileImportItem[] }) => {
      const total: Omit<FileImportResponse, 'items'> = { created: 0, skipped: 0, linked: 0 }
      try {
        for (const part of chunk(items, FILE_IMPORT_ITEMS_MAX)) {
          const res = await importFileEntries({ provider, items: part })
          total.created += res.created
          total.skipped += res.skipped
          total.linked += res.linked
        }
      } finally {
        // 일부만 저장됐어도 지갑·여정을 새로 받는다
        if (total.created > 0) void invalidateManual(client)
      }
      return total
    },
    // 실패 안내는 화면이 직접 한다. 보낸 항목(가맹점·금액)은 화면이 내려가면 바로 캐시에서 지운다
    meta: { silent: true },
    gcTime: 0,
  })
}
