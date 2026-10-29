import {
  hashPassword,
  parseScryptHash,
  verifyPassword,
} from './password-hash.js';

const FAST = { N: 16_384, r: 8, p: 1 };

describe('admin password hash (scrypt)', () => {
  it('hashes with a random salt in the scrypt$N$r$p$salt$hash format and verifies only the right password', async () => {
    const a = await hashPassword('correct horse battery', FAST);
    const b = await hashPassword('correct horse battery', FAST);
    expect(a).toMatch(
      /^scrypt\$16384\$8\$1\$[A-Za-z0-9_-]{22}\$[A-Za-z0-9_-]{43}$/,
    );
    expect(a).not.toBe(b);
    const parsed = parseScryptHash(a);
    expect(parsed).not.toBeNull();
    expect(await verifyPassword('correct horse battery', parsed!)).toBe(true);
    expect(await verifyPassword('correct horse batterz', parsed!)).toBe(false);
    expect(await verifyPassword('', parsed!)).toBe(false);
  });

  it('uses N = 2^17 by default and still verifies older N = 2^15 hashes (parameters live in the hash)', async () => {
    const strong = await hashPassword('x'.repeat(12));
    expect(strong).toMatch(/^scrypt\$131072\$8\$1\$/);
    expect(await verifyPassword('x'.repeat(12), parseScryptHash(strong)!)).toBe(
      true,
    );
    const legacy = await hashPassword('y'.repeat(12), {
      N: 32_768,
      r: 8,
      p: 1,
    });
    expect(await verifyPassword('y'.repeat(12), parseScryptHash(legacy)!)).toBe(
      true,
    );
  });

  it('rejects malformed or out-of-range hashes (no huge memory from a bad env value)', () => {
    const salt = Buffer.alloc(16).toString('base64url');
    const hash = Buffer.alloc(32).toString('base64url');
    for (const raw of [
      '',
      'plaintext-password',
      `bcrypt$16384$8$1$${salt}$${hash}`,
      `scrypt$16383$8$1$${salt}$${hash}`, // 2의 거듭제곱 아님
      `scrypt$8192$8$1$${salt}$${hash}`, // 너무 작음
      `scrypt$4194304$8$1$${salt}$${hash}`, // 너무 큼
      `scrypt$16384$64$1$${salt}$${hash}`,
      `scrypt$16384$8$9$${salt}$${hash}`,
      `scrypt$16384$8$1$${Buffer.alloc(8).toString('base64url')}$${hash}`,
      `scrypt$16384$8$1$${salt}$${Buffer.alloc(16).toString('base64url')}`,
      `scrypt$16384$8$1$${salt}$not base64!`,
    ]) {
      expect(parseScryptHash(raw)).toBeNull();
    }
    expect(parseScryptHash(`scrypt$16384$8$1$${salt}$${hash}`)).not.toBeNull();
  });
});
