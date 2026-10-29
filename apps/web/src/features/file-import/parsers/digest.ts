import type { FileImportProvider } from '@yeojeong/shared'

/**
 * 거래 번호 다이제스트: SHA-256(UTF-8 "{provider}:{거래 번호}") 소문자 hex 64자(@yeojeong/shared FILE_IMPORT_TXN_DIGEST_PATTERN).
 * 거래 번호 원문은 서버로 보내지 않는다 — 서버는 이 값에 전용 키로 HMAC을 씌워 중복 판정 키(importKey)로만 쓴다
 */
export async function txnDigest(provider: FileImportProvider, txnNo: string): Promise<string> {
  const data = new TextEncoder().encode(`${provider}:${txnNo}`)
  const hash = new Uint8Array(await crypto.subtle.digest('SHA-256', data))
  return Array.from(hash, (b) => b.toString(16).padStart(2, '0')).join('')
}
