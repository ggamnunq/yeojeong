import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto';

// 관리자 2단계 인증 TOTP(RFC 6238 — HMAC-SHA1, 30초, 6자리). Node 내장 crypto만 쓴다(의존성 0).
// 이 파일은 node:crypto 말고는 import하지 않는다 — scripts/admin-totp.mjs가 빌드 없이(Node 타입 제거) 바로 불러 쓴다.

export const TOTP_PERIOD_SECONDS = 30;
export const TOTP_DIGITS = 6;
/** 앞뒤로 허용하는 창 수(시계 오차) */
export const TOTP_SKEW = 1;
/** 시크릿 최소 길이(RFC 4226 권장 128비트, 생성은 160비트) */
export const TOTP_MIN_SECRET_BYTES = 16;
const ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
const CODE = /^\d{6}$/;

/** RFC 4648 base32(패딩 없이) */
export function base32Encode(bytes: Buffer): string {
  let bits = 0;
  let value = 0;
  let out = '';
  for (const byte of bytes) {
    value = (value << 8) | byte;
    bits += 8;
    while (bits >= 5) {
      out += ALPHABET[(value >>> (bits - 5)) & 31];
      bits -= 5;
    }
  }
  if (bits > 0) out += ALPHABET[(value << (5 - bits)) & 31];
  return out;
}

/** base32 → 바이트. 공백·하이픈·패딩(=)·소문자는 받는다. 그 밖의 글자가 있으면 null */
export function base32Decode(raw: string): Buffer | null {
  const text = raw.replace(/[\s-]/g, '').replace(/=+$/, '').toUpperCase();
  if (!text) return null;
  let bits = 0;
  let value = 0;
  const out: number[] = [];
  for (const ch of text) {
    const index = ALPHABET.indexOf(ch);
    if (index < 0) return null;
    value = (value << 5) | index;
    bits += 5;
    if (bits >= 8) {
      out.push((value >>> (bits - 8)) & 255);
      bits -= 8;
    }
  }
  return Buffer.from(out);
}

/** 새 시크릿(160비트, base32 32자) */
export function generateTotpSecret(): string {
  return base32Encode(randomBytes(20));
}

/** 시각 → TOTP 창 번호 */
export function totpCounter(now: number): number {
  return Math.floor(now / 1000 / TOTP_PERIOD_SECONDS);
}

/** RFC 4226 HOTP(동적 절단) */
export function hotp(key: Buffer, counter: number): string {
  const message = Buffer.alloc(8);
  message.writeBigUInt64BE(BigInt(counter));
  const mac = createHmac('sha1', key).update(message).digest();
  const offset = mac[mac.length - 1] & 0x0f;
  const binary = mac.readUInt32BE(offset) & 0x7fffffff;
  return String(binary % 10 ** TOTP_DIGITS).padStart(TOTP_DIGITS, '0');
}

/**
 * 코드가 맞으면 맞은 창 번호, 아니면 null. 앞뒤 1창(±30초)까지 보고, 비교는 상수 시간이며 모든 창을 끝까지 계산한다.
 * 같은 코드 재사용 금지는 부르는 쪽이 창 번호로 막는다(AdminTotpGuard — DB에 마지막으로 쓴 창 번호)
 */
export function verifyTotp(
  key: Buffer,
  code: string,
  now: number = Date.now(),
): number | null {
  const given = Buffer.from(CODE.test(code) ? code : '000000x');
  const current = totpCounter(now);
  let matched: number | null = null;
  for (let delta = -TOTP_SKEW; delta <= TOTP_SKEW; delta += 1) {
    const expected = Buffer.from(hotp(key, current + delta));
    if (
      expected.length === given.length &&
      timingSafeEqual(expected, given) &&
      matched === null
    ) {
      matched = current + delta;
    }
  }
  return CODE.test(code) ? matched : null;
}

/** 인증 앱 등록용 otpauth:// URI(시크릿이 들어 있다 — 화면에만 보이고 저장하지 않는다) */
export function otpauthUri(
  secret: string,
  account: string,
  issuer = '여정 관리자',
): string {
  const label = `${encodeURIComponent(issuer)}:${encodeURIComponent(account)}`;
  // 인증 앱마다 +를 공백으로 읽지 않는 경우가 있어 %20으로 인코딩한다(URLSearchParams를 쓰지 않는다)
  const query = [
    ['secret', secret],
    ['issuer', issuer],
    ['algorithm', 'SHA1'],
    ['digits', String(TOTP_DIGITS)],
    ['period', String(TOTP_PERIOD_SECONDS)],
  ]
    .map(([k, v]) => `${k}=${encodeURIComponent(v)}`)
    .join('&');
  return `otpauth://totp/${label}?${query}`;
}
