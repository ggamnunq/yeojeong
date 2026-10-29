// 카드사 비밀번호 암호화(S8). CODEF는 비밀번호를 CODEF RSA 공개키로 암호화(RSA PKCS#1 v1.5, base64)해 받는다.
// 브라우저에서 암호화하고 서버는 암호문만 CODEF로 넘긴다(서버에 평문 비밀번호가 가지 않는다).
// - 공개키 해석: WebCrypto가 SPKI(DER)를 읽어 JWK(n, e)로 내보낸다 — ASN.1을 직접 파싱하지 않는다.
// - PKCS#1 v1.5 암호화: WebCrypto는 지원하지 않아 micro-rsa-dsa-dh(paulmillr, RFC 8017, 의존성은 @noble/hashes)를 쓴다.
//   패딩 난수는 crypto.getRandomValues. 이 화면에서만 쓰므로 동적 import로 따로 받는다(첫 화면 번들에 넣지 않는다).
// 평문 비밀번호는 이 함수의 인자로만 머물고 저장·로그하지 않는다.

const PEM = /-----(BEGIN|END) PUBLIC KEY-----/g

/** PEM 또는 base64 한 줄 → DER 바이트 */
export function spkiBytes(publicKey: string): Uint8Array<ArrayBuffer> {
  const base64 = publicKey.replace(PEM, '').replace(/\s+/g, '')
  if (!/^[A-Za-z0-9+/]+={0,2}$/.test(base64)) throw new Error('공개키 형식이 올바르지 않아요')
  const binary = atob(base64)
  const bytes = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i)
  return bytes
}

function base64UrlToBigInt(value: string): bigint {
  const base64 = value.replace(/-/g, '+').replace(/_/g, '/')
  const binary = atob(base64 + '='.repeat((4 - (base64.length % 4)) % 4))
  let hex = ''
  for (let i = 0; i < binary.length; i += 1) hex += binary.charCodeAt(i).toString(16).padStart(2, '0')
  return BigInt(`0x${hex || '0'}`)
}

function toBase64(bytes: Uint8Array): string {
  let binary = ''
  for (const byte of bytes) binary += String.fromCharCode(byte)
  return btoa(binary)
}

/** CODEF 공개키(SPKI) → RSA 공개키(n, e) */
export async function rsaPublicKey(publicKey: string): Promise<{ n: bigint; e: bigint }> {
  // 알고리즘 이름은 importKey가 요구해서 넣을 뿐이다(키 재료만 꺼낸다). 키 길이는 CODEF가 정한다(1024비트 미만은 거른다)
  const key = await crypto.subtle.importKey(
    'spki',
    spkiBytes(publicKey),
    { name: 'RSA-OAEP', hash: 'SHA-256' },
    true,
    ['encrypt'],
  )
  const jwk = await crypto.subtle.exportKey('jwk', key)
  if (!jwk.n || !jwk.e) throw new Error('공개키 형식이 올바르지 않아요')
  const n = base64UrlToBigInt(jwk.n)
  if (n.toString(2).length < 1024) throw new Error('공개키가 너무 짧아요')
  return { n, e: base64UrlToBigInt(jwk.e) }
}

/**
 * 비밀번호 → CODEF 형식 암호문(RSA PKCS#1 v1.5, base64). FetchCardApprovalsRequest.encryptedPassword에 넣는다.
 * 같은 비밀번호도 매번 다른 암호문이 나온다(패딩 난수).
 */
export async function encryptCardPassword(publicKey: string, password: string): Promise<string> {
  if (password.length === 0) throw new Error('비밀번호를 입력해 주세요')
  const [key, { PKCS1_KEM }] = await Promise.all([rsaPublicKey(publicKey), import('micro-rsa-dsa-dh/rsa.js')])
  return toBase64(PKCS1_KEM.encrypt(key, new TextEncoder().encode(password)))
}

// ─── 공개키 고정(pinning) ───

/** 서버가 내려준 공개키가 빌드에 고정한 지문과 다르다(키 교체 또는 변조). 암호화하지 않는다 */
export class CardImportKeyPinError extends Error {
  constructor() {
    super('카드사 비밀번호를 보호하는 키를 확인하지 못했어요')
    this.name = 'CardImportKeyPinError'
  }
}

/** 공개키(DER) SHA-256 hex — 서버 config.publicKeyFingerprint와 같은 계산 */
export async function publicKeyFingerprint(publicKey: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', spkiBytes(publicKey))
  return Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, '0')).join('')
}

/** 빌드에 고정한 지문(VITE_CODEF_PUBKEY_SHA256). 없으면 '' */
export function pinnedFingerprint(): string {
  return (import.meta.env.VITE_CODEF_PUBKEY_SHA256 ?? '').trim().toLowerCase()
}

/**
 * 지문 고정 정책: 고정값이 있으면 'pinned', 없으면 개발·테스트(목 포함)만 'unpinned' 허용, 운영 빌드는 'blocked'(진입을 막는다)
 */
export function pinPolicy(): 'pinned' | 'unpinned' | 'blocked' {
  if (pinnedFingerprint()) return 'pinned'
  return import.meta.env.PROD ? 'blocked' : 'unpinned'
}

/** 암호화 전에 부른다. 고정값이 있으면 지문이 같아야 하고, 운영 빌드에 고정값이 없으면 거부한다 */
export async function assertPinnedKey(publicKey: string): Promise<void> {
  const policy = pinPolicy()
  if (policy === 'blocked') throw new CardImportKeyPinError()
  if (policy === 'pinned' && (await publicKeyFingerprint(publicKey)) !== pinnedFingerprint()) {
    throw new CardImportKeyPinError()
  }
}

