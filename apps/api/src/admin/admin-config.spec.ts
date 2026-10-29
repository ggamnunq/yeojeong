import { AppException } from '../common/errors/index.js';
import { AdminConfig, actorIdOf } from './admin-config.js';
import { hashPassword } from './password-hash.js';
import { generateTotpSecret, hotp, totpCounter, base32Decode } from './totp.js';

const FAST = { N: 16_384, r: 8, p: 1 };
const TOTP = generateTotpSecret();

describe('AdminConfig', () => {
  it('is disabled unless ADMIN_USERNAME, ADMIN_PASSWORD_HASH and ADMIN_TOTP_SECRET are all set', async () => {
    const hash = await hashPassword('pw-123456789012', FAST);
    for (const values of [
      {},
      { username: 'ops' },
      { passwordHash: hash },
      { username: 'ops', passwordHash: hash },
      { username: 'ops', totpSecret: TOTP },
      { passwordHash: hash, totpSecret: TOTP },
      { username: ' ', passwordHash: hash, totpSecret: TOTP },
    ]) {
      const config = new AdminConfig(values);
      expect(config.enabled).toBe(false);
      expect(config.actorId).toBeNull();
      expect(await config.verify('ops', 'pw-123456789012')).toBe(false);
      expect(config.verifyTotpCode('123456')).toBeNull();
    }
    expect(
      new AdminConfig({ username: 'ops', passwordHash: hash, totpSecret: TOTP })
        .enabled,
    ).toBe(true);
  });

  it('refuses to boot with a malformed username, hash or TOTP secret (without echoing the value)', async () => {
    const hash = await hashPassword('pw-1', FAST);
    expect(
      () =>
        new AdminConfig({
          username: 'ops',
          passwordHash: 'hunter2',
          totpSecret: TOTP,
        }),
    ).toThrow(/ADMIN_PASSWORD_HASH/);
    expect(
      () =>
        new AdminConfig({
          username: 'ops',
          passwordHash: 'hunter2',
          totpSecret: TOTP,
        }),
    ).not.toThrow(/hunter2/);
    expect(
      () =>
        new AdminConfig({
          username: 'a b',
          passwordHash: hash,
          totpSecret: TOTP,
        }),
    ).toThrow(/ADMIN_USERNAME/);
    // base32가 아니거나 128비트 미만
    for (const totpSecret of ['not-base32!!', 'MZXW6YTBOI']) {
      expect(
        () =>
          new AdminConfig({ username: 'ops', passwordHash: hash, totpSecret }),
      ).toThrow(/ADMIN_TOTP_SECRET/);
    }
  });

  it('verifies username and password together, and TOTP codes separately', async () => {
    const config = new AdminConfig({
      username: 'ops-admin',
      passwordHash: await hashPassword('pw-123456789012', FAST),
      totpSecret: TOTP,
    });
    expect(await config.verify('ops-admin', 'pw-123456789012')).toBe(true);
    expect(await config.verify('ops-admin', 'pw-123456789013')).toBe(false);
    expect(await config.verify('ops-admin2', 'pw-123456789012')).toBe(false);
    expect(await config.verify('OPS-ADMIN', 'pw-123456789012')).toBe(false);
    expect(await config.verifyPasswordOnly('pw-123456789012')).toBe(true);
    expect(await config.verifyPasswordOnly('nope')).toBe(false);
    const now = Date.now();
    const code = hotp(base32Decode(TOTP)!, totpCounter(now));
    expect(config.verifyTotpCode(code, now)).toBe(totpCounter(now));
    expect(
      config.verifyTotpCode(code === '000000' ? '111111' : '000000', now),
    ).toBeNull();
  });

  it('runs scrypt one at a time per instance and rejects beyond the queue (memory guard)', async () => {
    const config = new AdminConfig({
      username: 'ops-admin',
      passwordHash: await hashPassword('pw-1', FAST),
      totpSecret: TOTP,
    });
    const results = await Promise.allSettled(
      Array.from({ length: 12 }, () => config.verifyPasswordOnly('pw-1')),
    );
    const rejected = results.filter((r) => r.status === 'rejected');
    expect(
      results.filter((r) => r.status === 'fulfilled' && r.value === true),
    ).toHaveLength(9);
    expect(rejected).toHaveLength(3);
    expect((rejected[0] as PromiseRejectedResult).reason).toBeInstanceOf(
      AppException,
    );
    expect(
      ((rejected[0] as PromiseRejectedResult).reason as AppException).code,
    ).toBe('RATE_LIMITED');
    // 줄이 비면 다시 받는다
    expect(await config.verifyPasswordOnly('pw-1')).toBe(true);
  });

  it('derives a stable UUID actor id and a credential tag that changes with any credential', async () => {
    expect(actorIdOf('ops-admin')).toBe(actorIdOf('ops-admin'));
    expect(actorIdOf('ops-admin')).not.toBe(actorIdOf('ops-admin2'));
    expect(actorIdOf('ops-admin')).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-8[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/,
    );
    const hash = await hashPassword('pw-1', FAST);
    const a = new AdminConfig({
      username: 'ops-admin',
      passwordHash: hash,
      totpSecret: TOTP,
    });
    const sameAgain = new AdminConfig({
      username: 'ops-admin',
      passwordHash: hash,
      totpSecret: TOTP,
    });
    const newHash = new AdminConfig({
      username: 'ops-admin',
      passwordHash: await hashPassword('pw-1', FAST),
      totpSecret: TOTP,
    });
    const newTotp = new AdminConfig({
      username: 'ops-admin',
      passwordHash: hash,
      totpSecret: generateTotpSecret(),
    });
    expect(a.credentialTag).toBe(sameAgain.credentialTag);
    expect(a.credentialTag).toMatch(/^[0-9a-f]{64}$/);
    expect(newHash.credentialTag).not.toBe(a.credentialTag);
    expect(newTotp.credentialTag).not.toBe(a.credentialTag);
    expect(newTotp.actorId).toBe(a.actorId);
  });
});
