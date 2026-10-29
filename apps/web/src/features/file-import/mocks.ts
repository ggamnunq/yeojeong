import {
  FILE_IMPORT_CHECK_MAX,
  FILE_IMPORT_ITEMS_MAX,
  FILE_IMPORT_TXN_DIGEST_PATTERN,
  type FileImportCheckRequest,
  type FileImportCheckResponse,
  type FileImportRequest,
  type FileImportResponse,
} from '@yeojeong/shared'
import { HttpResponse, type HttpHandler } from 'msw'
import { activeMembership, db } from '../../mocks/data'
import { api, denyUnlessAuthenticated, mockError } from '../../mocks/utils'
import { kst } from '../payments/rules'

// 거래 내역 파일 가져오기(W10) 목. features.fileImport가 꺼져 있으면(db.fileImport = false) 404.
// "추가됨" = db.fileImportedDigests에 있는 다이제스트. 자동 연결 여정 = 결제 시각(KST 날짜)이 기간 안인 내가 멤버인 예정·진행 중 여정.
// 저장한 결제는 지갑 목(db.walletEntries)에 들어가 HF-49에 보인다(여정 연결은 목에서 생략).

const DIGEST = new RegExp(FILE_IMPORT_TXN_DIGEST_PATTERN)

function tripFor(occurredAt: string): string | null {
  const date = kst(occurredAt).date
  const trip = db.trips.find(
    (t) => (t.status === 'ONGOING' || t.status === 'UPCOMING') && activeMembership(t.tripId, db.meUserId) && t.startDate <= date && date <= t.endDate,
  )
  return trip?.tripId ?? null
}

const gate = () => denyUnlessAuthenticated() ?? (db.fileImport ? null : mockError('NOT_FOUND', 404))

export const handlers: HttpHandler[] = [
  api.post<FileImportCheckResponse, FileImportCheckRequest>('/api/wallet/entries/file-import/check', async ({ request }) => {
    const denied = gate()
    if (denied) return denied
    const { provider, items } = await request.json()
    if (provider !== 'WECHAT' || !Array.isArray(items) || items.length === 0 || items.length > FILE_IMPORT_CHECK_MAX || items.some((i) => !DIGEST.test(i.txnDigest))) {
      return mockError('VALIDATION_FAILED', 400)
    }
    return HttpResponse.json({
      items: items.map((i) => ({ imported: db.fileImportedDigests.includes(i.txnDigest), inTripId: tripFor(i.occurredAt) })),
    })
  }),

  api.post<FileImportResponse, FileImportRequest>('/api/wallet/entries/file-import', async ({ request }) => {
    const denied = gate()
    if (denied) return denied
    const { provider, items } = await request.json()
    if (
      provider !== 'WECHAT' ||
      !Array.isArray(items) ||
      items.length === 0 ||
      items.length > FILE_IMPORT_ITEMS_MAX ||
      items.some((i) => !DIGEST.test(i.txnDigest) || i.currency !== 'CNY' || !/^\d+(\.\d{1,2})?$/.test(i.amount))
    ) {
      return mockError('VALIDATION_FAILED', 400)
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
