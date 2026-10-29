import type { FileImportCheckRequest, FileImportCheckResponse, FileImportRequest, FileImportResponse } from '@yeojeong/shared'
import { apiFetch } from '../../api'

// 거래 내역 파일 가져오기(W10) API. 서버 계약: apps/api/src/file-import/README.md.
// 결과(가맹점·금액)는 쿼리 캐시에 넣지 않는다 — 화면 컴포넌트 state에만 둔다. 그래서 두 호출 모두 쿼리가 아니라 함수다.

/** POST /wallet/entries/file-import/check — 추가됨 · 자동 연결될 여정(다이제스트·시각만 보낸다) */
export const checkFileImport = (body: FileImportCheckRequest, signal?: AbortSignal) =>
  apiFetch<FileImportCheckResponse>('/wallet/entries/file-import/check', { body, signal })

/** POST /wallet/entries/file-import — 고른 결제 저장 */
export const importFileEntries = (body: FileImportRequest) => apiFetch<FileImportResponse>('/wallet/entries/file-import', { body })
