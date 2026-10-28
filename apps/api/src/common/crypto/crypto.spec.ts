import { randomBytes } from 'node:crypto';
import { ValueSigner } from './signed-value.js';
import { TokenCipher } from './token-cipher.js';

describe('ValueSigner', () => {
  const signer = new ValueSigner('x'.repeat(32));
  const now = Date.UTC(2026, 9, 28);

  it('round-trips a value for the same purpose before it expires', () => {
    const token = signer.sign('signup', { id: 'ticket-1' }, 60, now);
    expect(signer.verify('signup', token, now + 59_000)).toEqual({
      id: 'ticket-1',
    });
  });

  it('rejects expired tokens, other purposes, other keys and tampering', () => {
    const token = signer.sign('signup', 'ticket-1', 60, now);
    expect(signer.verify('signup', token, now + 60_000)).toBeNull();
    expect(signer.verify('kakao-oauth', token, now)).toBeNull();
    expect(
      new ValueSigner('y'.repeat(32)).verify('signup', token, now),
    ).toBeNull();

    const [version, payload, mac] = token.split('.');
    const forged = Buffer.from(
      JSON.stringify({ p: 'signup', v: 'ticket-2', e: now / 1000 + 60 }),
    ).toString('base64url');
    expect(
      signer.verify('signup', `${version}.${forged}.${mac}`, now),
    ).toBeNull();
    expect(
      signer.verify('signup', `${version}.${payload}.${mac}x`, now),
    ).toBeNull();
    expect(signer.verify('signup', undefined, now)).toBeNull();
    expect(signer.verify('signup', 'garbage', now)).toBeNull();
  });
});

describe('TokenCipher', () => {
  const cipher = new TokenCipher(randomBytes(32));

  it('encrypts with a fresh IV and decrypts back', () => {
    const a = cipher.encrypt('toss-access-token');
    const b = cipher.encrypt('toss-access-token');
    expect(a.equals(b)).toBe(false);
    expect(a.toString('latin1')).not.toContain('toss-access-token');
    expect(cipher.decrypt(a).toString()).toBe('toss-access-token');
  });

  it('fails on tampering, a wrong key or different associated data', () => {
    const data = cipher.encrypt('secret', 'connection-1');
    const tampered = Buffer.from(data);
    tampered[tampered.length - 1] ^= 1;
    expect(() => cipher.decrypt(tampered, 'connection-1')).toThrow();
    expect(() => cipher.decrypt(data, 'connection-2')).toThrow();
    expect(() =>
      new TokenCipher(randomBytes(32)).decrypt(data, 'connection-1'),
    ).toThrow();
    expect(cipher.decrypt(data, 'connection-1').toString()).toBe('secret');
  });

  it('requires a 32-byte key', () => {
    expect(() => new TokenCipher(randomBytes(16))).toThrow('32바이트');
  });
});
