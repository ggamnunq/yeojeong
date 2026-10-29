import { randomBytes, scrypt, timingSafeEqual } from 'node:crypto';

// 관리자 비밀번호 해시(ADMIN_PASSWORD_HASH). Node 내장 scrypt만 쓴다(의존성 0).
// 형식: scrypt$<N>$<r>$<p>$<salt base64url>$<hash base64url>
// 이 파일은 node:crypto 말고는 import하지 않는다 — scripts/admin-hash.mjs가 빌드 없이(Node 타입 제거) 바로 불러 쓴다.

/** 새 해시의 기본 비용: N = 2^15, r = 8, p = 1(메모리 약 32MB, 수십 ms) */
export const SCRYPT_DEFAULTS = { N: 32_768, r: 8, p: 1 } as const;
const KEY_LENGTH = 32;
const SALT_LENGTH = 16;
// env 값이 잘못돼도 부팅을 무겁게 하거나 요청마다 메모리를 크게 쓰지 않게 비용 범위를 묶는다
const N_RANGE = { min: 16_384, max: 1_048_576 };
const R_RANGE = { min: 8, max: 32 };
const P_RANGE = { min: 1, max: 4 };
const B64URL = /^[A-Za-z0-9_-]+$/;

export interface ScryptHash {
  N: number;
  r: number;
  p: number;
  salt: Buffer;
  hash: Buffer;
}

function scryptAsync(
  password: string,
  salt: Buffer,
  params: { N: number; r: number; p: number },
  keyLength: number,
): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    scrypt(
      password,
      salt,
      keyLength,
      {
        N: params.N,
        r: params.r,
        p: params.p,
        // 128 · N · r 바이트 + 여유
        maxmem: 256 * params.N * params.r,
      },
      (err, key) => (err ? reject(err) : resolve(key)),
    );
  });
}

function inRange(value: number, range: { min: number; max: number }) {
  return (
    Number.isSafeInteger(value) && value >= range.min && value <= range.max
  );
}

/** 형식·비용 범위가 맞으면 해시, 아니면 null(값은 어디에도 내보내지 않는다) */
export function parseScryptHash(raw: string): ScryptHash | null {
  const parts = raw.trim().split('$');
  if (parts.length !== 6 || parts[0] !== 'scrypt') return null;
  const [, n, r, p, salt, hash] = parts;
  const N = Number(n);
  const R = Number(r);
  const P = Number(p);
  // N은 2의 거듭제곱이어야 한다
  if (!inRange(N, N_RANGE) || (N & (N - 1)) !== 0) return null;
  if (!inRange(R, R_RANGE) || !inRange(P, P_RANGE)) return null;
  if (!B64URL.test(salt) || !B64URL.test(hash)) return null;
  const saltBuf = Buffer.from(salt, 'base64url');
  const hashBuf = Buffer.from(hash, 'base64url');
  if (saltBuf.length < SALT_LENGTH || hashBuf.length !== KEY_LENGTH)
    return null;
  return { N, r: R, p: P, salt: saltBuf, hash: hashBuf };
}

/** 새 비밀번호 해시(scripts/admin-hash.mjs) */
export async function hashPassword(
  password: string,
  params: { N: number; r: number; p: number } = SCRYPT_DEFAULTS,
): Promise<string> {
  const salt = randomBytes(SALT_LENGTH);
  const hash = await scryptAsync(password, salt, params, KEY_LENGTH);
  return [
    'scrypt',
    params.N,
    params.r,
    params.p,
    salt.toString('base64url'),
    hash.toString('base64url'),
  ].join('$');
}

/** 비밀번호가 해시와 맞는지(상수 시간 비교). 해시 계산은 늘 끝까지 한다 */
export async function verifyPassword(
  password: string,
  stored: ScryptHash,
): Promise<boolean> {
  const derived = await scryptAsync(password, stored.salt, stored, KEY_LENGTH);
  return timingSafeEqual(derived, stored.hash);
}
