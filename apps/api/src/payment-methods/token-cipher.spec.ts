import { randomBytes } from 'node:crypto';
import type { ConfigService } from '@nestjs/config';
import { CipherPurpose, TokenCipher, parseEncryptionKey } from './token-cipher.js';

const config = (values: Record<string, string | undefined>) =>
  ({ get: (name: string) => values[name] }) as unknown as ConfigService;

describe('TokenCipher (AES-256-GCM)', () => {
  const key = randomBytes(32).toString('base64');
  const cipher = TokenCipher.fromKey(key);

  it('round-trips and never stores plaintext', () => {
    const enc = cipher.encrypt('access-token-secret', CipherPurpose.ACCESS_TOKEN);
    expect(Buffer.from(enc).toString('utf8')).not.toContain('access-token-secret');
    expect(enc[0]).toBe(1);
    expect(cipher.decrypt(enc, CipherPurpose.ACCESS_TOKEN)).toBe('access-token-secret');
    // 같은 평문도 IV가 달라 암호문이 매번 다르다
    expect(Buffer.from(cipher.encrypt('x', CipherPurpose.ACCESS_TOKEN))).not.toEqual(
      Buffer.from(cipher.encrypt('x', CipherPurpose.ACCESS_TOKEN)),
    );
    expect(cipher.decryptJson(cipher.encryptJson({ a: 1 }, CipherPurpose.RAW_PAYLOAD), CipherPurpose.RAW_PAYLOAD)).toEqual({ a: 1 });
  });

  it('rejects another column, another key and tampering', () => {
    const enc = cipher.encrypt('token', CipherPurpose.ACCESS_TOKEN);
    expect(() => cipher.decrypt(enc, CipherPurpose.REFRESH_TOKEN)).toThrow();
    expect(() => TokenCipher.fromKey(randomBytes(32).toString('hex')).decrypt(enc, CipherPurpose.ACCESS_TOKEN)).toThrow();
    const tampered = new Uint8Array(enc);
    tampered[tampered.length - 1] ^= 1;
    expect(() => cipher.decrypt(tampered, CipherPurpose.ACCESS_TOKEN)).toThrow();
    expect(() => cipher.decrypt(new Uint8Array([2, 0]), CipherPurpose.ACCESS_TOKEN)).toThrow('형식');
  });

  it('parses base64 and hex keys of 32 bytes only', () => {
    expect(parseEncryptionKey(randomBytes(32).toString('hex'))).toHaveLength(32);
    expect(() => parseEncryptionKey(randomBytes(16).toString('base64'))).toThrow('32바이트');
  });

  it('uses a dev key locally and fails on use (not boot) in production without a key', () => {
    const dev = new TokenCipher(config({}));
    expect(dev.decrypt(dev.encrypt('t', CipherPurpose.ACCESS_TOKEN), CipherPurpose.ACCESS_TOKEN)).toBe('t');
    const prod = new TokenCipher(config({ NODE_ENV: 'production' }));
    expect(() => prod.encrypt('t', CipherPurpose.ACCESS_TOKEN)).toThrow('TOKEN_ENCRYPTION_KEY');
  });

  it('hashes external refs deterministically', () => {
    expect(cipher.hmacRef('5365123456781934')).toBe(cipher.hmacRef('5365123456781934'));
    expect(cipher.hmacRef('5365123456781934')).toMatch(/^[0-9a-f]{64}$/);
    expect(TokenCipher.fromKey(randomBytes(32).toString('base64')).hmacRef('a')).not.toBe(cipher.hmacRef('a'));
  });
});
