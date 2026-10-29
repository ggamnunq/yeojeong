import {
  FILE_IMPORT_CHECK_MAX,
  FILE_IMPORT_ITEMS_MAX,
  FILE_IMPORT_PROVIDER_VALUES,
  FILE_IMPORT_TXN_DIGEST_PATTERN,
  type FileImportCheckRequest,
  type FileImportCheckResponse,
  type FileImportProvider,
  type FileImportRequest,
  type FileImportResponse,
} from '@yeojeong/shared'
import { HttpResponse, type HttpHandler } from 'msw'
import { db } from '../../mocks/data'
import { api, denyUnlessAuthenticated, mockError } from '../../mocks/utils'

// 거래 내역 파일 가져오기(W10 · W11) 목. features.fileImport가 꺼져 있거나(db.fileImport = false) 켜지지 않은 공급자(db.fileImportProviders)면 404.
// 확인은 대조값 배열만 받는다: "추가됨" = db.fileImportedDigests에 있는 다이제스트. 자동 연결 여정은 화면이 내 여정 목록으로 정한다.
// 저장한 결제는 지갑 목(db.walletEntries)에 들어가 HF-49에 보인다(여정 연결은 목에서 생략).
// 저장 상한 확인용: 가맹점 이름이 "DAILY-LIMIT"이면 429 FILE_IMPORT_DAILY_LIMIT.

const DIGEST = new RegExp(FILE_IMPORT_TXN_DIGEST_PATTERN)

const gate = () => denyUnlessAuthenticated() ?? (db.fileImport ? null : mockError('NOT_FOUND', 404))
/** 서버와 같다: 모르는 공급자는 400, 켜지지 않은 공급자는 404 */
const providerGate = (provider: unknown) =>
  !(FILE_IMPORT_PROVIDER_VALUES as readonly unknown[]).includes(provider)
    ? mockError('VALIDATION_FAILED', 400)
    : db.fileImportProviders.includes(provider as FileImportProvider)
      ? null
      : mockError('NOT_FOUND', 404)

export const handlers: HttpHandler[] = [
  api.post<FileImportCheckResponse, FileImportCheckRequest>('/api/wallet/entries/file-import/check', async ({ request }) => {
    const denied = gate()
    if (denied) return denied
    const body = await request.json()
    const { provider, txnDigests } = body
    const off = providerGate(provider)
    if (off) return off
    // 서버와 같다: 계약 밖 필드(일시·금액 등)는 400
    if (
      Object.keys(body).some((k) => k !== 'provider' && k !== 'txnDigests') ||
      !Array.isArray(txnDigests) ||
      txnDigests.length === 0 ||
      txnDigests.length > FILE_IMPORT_CHECK_MAX ||
      txnDigests.some((d) => !DIGEST.test(d))
    ) {
      return mockError('VALIDATION_FAILED', 400)
    }
    return HttpResponse.json({ imported: txnDigests.map((d) => db.fileImportedDigests.includes(d)) })
  }),

  api.post<FileImportResponse, FileImportRequest>('/api/wallet/entries/file-import', async ({ request }) => {
    const denied = gate()
    if (denied) return denied
    const { provider, items } = await request.json()
    const off = providerGate(provider)
    if (off) return off
    if (
      !Array.isArray(items) ||
      items.length === 0 ||
      items.length > FILE_IMPORT_ITEMS_MAX ||
      items.some((i) => !DIGEST.test(i.txnDigest) || i.currency !== 'CNY' || !/^\d+(\.\d{1,2})?$/.test(i.amount))
    ) {
      return mockError('VALIDATION_FAILED', 400)
    }
    if (items.some((i) => i.merchantName === 'DAILY-LIMIT')) {
      return mockError('FILE_IMPORT_DAILY_LIMIT', 429, { retryAfter: new Date(Date.now() + 3_600_000).toISOString(), retryAfterSec: 3600 })
    }
    const results = items.map((i, index) => {
      if (db.fileImportedDigests.includes(i.txnDigest)) return { created: false, entryId: `we-file-${i.txnDigest.slice(0, 8)}` }
      db.fileImportedDigests.push(i.txnDigest)
      const id = `we-file-${i.txnDigest.slice(0, 8)}-${index}`
      db.walletEntries.push({
        id,
        userId: db.meUserId,
        occurredAt: i.occurredAt,
        memo: i.merchantName,
        amount: i.amount,
        currency: i.currency,
        spotKrwAmount: null,
        expenseId: null,
        version: 1,
      })
      return { created: true, entryId: id }
    })
    const created = results.filter((r) => r.created).length
    return HttpResponse.json({ items: results, created, skipped: results.length - created, linked: 0 }, { status: 201 })
  }),
]
