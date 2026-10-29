import {
  base32Decode,
  base32Encode,
  generateTotpSecret,
  hotp,
  otpauthUri,
  totpCounter,
  verifyTotp,
} from './totp.js';

// RFC 6238 부록 B(SHA1, 시크릿 "12345678901234567890") — 8자리 값의 끝 6자리
const RFC_KEY = Buffer.from('12345678901234567890', 'ascii');
const VECTORS: [number, string][] = [
  [59, '287082'],
  [1_111_111_109, '081804'],
  [1_111_111_111, '050471'],
  [1_234_567_890, '005924'],
  [2_000_000_000, '279037'],
  [20_000_000_000, '353130'],
];

describe('TOTP (RFC 6238)', () => {
  it('matches the RFC 6238 SHA1 test vectors', () => {
    for (const [seconds, code] of VECTORS) {
      expect(hotp(RFC_KEY, totpCounter(seconds * 1000))).toBe(code);
      expect(verifyTotp(RFC_KEY, code, seconds * 1000)).toBe(
        totpCounter(seconds * 1000),
      );
    }
  });

  it('accepts ±1 window (30s skew) and rejects older/newer codes and non-6-digit input', () => {
    const now = 1_234_567_890_000;
    const c = totpCounter(now);
    expect(verifyTotp(RFC_KEY, hotp(RFC_KEY, c - 1), now)).toBe(c - 1);
    expect(verifyTotp(RFC_KEY, hotp(RFC_KEY, c + 1), now)).toBe(c + 1);
    expect(verifyTotp(RFC_KEY, hotp(RFC_KEY, c - 2), now)).toBeNull();
    expect(verifyTotp(RFC_KEY, hotp(RFC_KEY, c + 2), now)).toBeNull();
    for (const bad of ['', '12345', '1234567', 'abcdef', ' 05924', '00592４']) {
      expect(verifyTotp(RFC_KEY, bad, now)).toBeNull();
    }
  });

  it('base32 round-trips (RFC 4648 vectors) and rejects invalid characters', () => {
    expect(base32Encode(Buffer.from('foobar'))).toBe('MZXW6YTBOI');
    expect(base32Decode('MZXW6YTBOI')?.toString()).toBe('foobar');
    expect(base32Decode('mzxw 6ytb-oi==')?.toString()).toBe('foobar');
    expect(base32Decode('MZXW1')).toBeNull();
    expect(base32Decode('')).toBeNull();
    const secret = generateTotpSecret();
    expect(secret).toMatch(/^[A-Z2-7]{32}$/);
    expect(base32Decode(secret)).toHaveLength(20);
  });

  it('builds an otpauth URI for authenticator apps', () => {
    expect(otpauthUri('MZXW6YTBOI', 'ops')).toBe(
      'otpauth://totp/%EC%97%AC%EC%A0%95%20%EA%B4%80%EB%A6%AC%EC%9E%90:ops?secret=MZXW6YTBOI&issuer=%EC%97%AC%EC%A0%95%20%EA%B4%80%EB%A6%AC%EC%9E%90&algorithm=SHA1&digits=6&period=30',
    );
  });
});
