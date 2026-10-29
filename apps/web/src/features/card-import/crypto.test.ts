/// <reference types="node" />
// 암호문을 독립 구현(Node OpenSSL privateDecrypt)으로 풀어 본다. 이 테스트만 Node 타입을 쓴다.
import { constants, generateKeyPairSync, privateDecrypt } from 'node:crypto'
import { describe, expect, it } from 'vitest'
import { encryptCardPassword, rsaPublicKey, spkiBytes } from './crypto'

const { publicKey, privateKey } = generateKeyPairSync('rsa', { modulusLength: 2048 })
const spkiBase64 = publicKey.export({ type: 'spki', format: 'der' }).toString('base64')
const pem = publicKey.export({ type: 'spki', format: 'pem' }).toString()

const decrypt = (cipherBase64: string) =>
  privateDecrypt({ key: privateKey, padding: constants.RSA_PKCS1_PADDING }, Buffer.from(cipherBase64, 'base64')).toString(
    'utf8',
  )

describe('encryptCardPassword (RSA PKCS#1 v1.5, CODEF 형식)', () => {
  it('encrypts so the private key holder recovers the exact password', async () => {
    const password = 'p@ss+word/한글=1'
    const cipher = await encryptCardPassword(spkiBase64, password)
    expect(cipher).toMatch(/^[A-Za-z0-9+/]+={0,2}$/)
    expect(Buffer.from(cipher, 'base64')).toHaveLength(256)
    expect(cipher).not.toContain(password)
    expect(decrypt(cipher)).toBe(password)
  })

  it('accepts a PEM key and uses fresh padding each time', async () => {
    const a = await encryptCardPassword(pem, 'same')
    const b = await encryptCardPassword(pem, 'same')
    expect(a).not.toBe(b)
    expect(decrypt(a)).toBe('same')
    expect(decrypt(b)).toBe('same')
  })

  it('reads n and e from the SPKI key', async () => {
    const jwk = publicKey.export({ format: 'jwk' })
    const { n, e } = await rsaPublicKey(spkiBase64)
    expect(e).toBe(65537n)
    expect(n.toString(16)).toBe(Buffer.from(jwk.n as string, 'base64url').toString('hex').replace(/^0+/, ''))
  })

  it('rejects an empty password and malformed or short keys', async () => {
    await expect(encryptCardPassword(spkiBase64, '')).rejects.toThrow()
    expect(() => spkiBytes('not a key!')).toThrow()
    const short = generateKeyPairSync('rsa', { modulusLength: 512 }).publicKey
    await expect(
      encryptCardPassword(short.export({ type: 'spki', format: 'der' }).toString('base64'), 'pw'),
    ).rejects.toThrow()
  })
})
