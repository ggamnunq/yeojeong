import { AdminConfig, actorIdOf } from './admin-config.js';
import { hashPassword } from './password-hash.js';

const FAST = { N: 16_384, r: 8, p: 1 };

describe('AdminConfig', () => {
  it('is disabled unless both ADMIN_USERNAME and ADMIN_PASSWORD_HASH are set', async () => {
    const hash = await hashPassword('pw-123456789012', FAST);
    for (const values of [
      {},
      { username: 'ops' },
      { passwordHash: hash },
      { username: ' ', passwordHash: hash },
    ]) {
      const config = new AdminConfig(values);
      expect(config.enabled).toBe(false);
      expect(config.actorId).toBeNull();
      expect(await config.verify('ops', 'pw-123456789012')).toBe(false);
    }
  });

  it('refuses to boot with a malformed username or hash (without echoing the value)', () => {
    expect(
      () => new AdminConfig({ username: 'ops', passwordHash: 'hunter2' }),
    ).toThrow(/ADMIN_PASSWORD_HASH/);
    expect(
      () => new AdminConfig({ username: 'ops', passwordHash: 'hunter2' }),
    ).not.toThrow(/hunter2/);
    expect(
      () => new AdminConfig({ username: 'a b', passwordHash: 'x' }),
    ).toThrow(/ADMIN_USERNAME/);
  });

  it('verifies username and password together', async () => {
    const config = new AdminConfig({
      username: 'ops-admin',
      passwordHash: await hashPassword('pw-123456789012', FAST),
    });
    expect(config.enabled).toBe(true);
    expect(await config.verify('ops-admin', 'pw-123456789012')).toBe(true);
    expect(await config.verify('ops-admin', 'pw-123456789013')).toBe(false);
    expect(await config.verify('ops-admin2', 'pw-123456789012')).toBe(false);
    expect(await config.verify('OPS-ADMIN', 'pw-123456789012')).toBe(false);
    expect(await config.verify('', '')).toBe(false);
  });

  it('derives a stable UUID actor id and a credential tag that changes with the credentials', async () => {
    expect(actorIdOf('ops-admin')).toBe(actorIdOf('ops-admin'));
    expect(actorIdOf('ops-admin')).not.toBe(actorIdOf('ops-admin2'));
    expect(actorIdOf('ops-admin')).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-8[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/,
    );
    const a = new AdminConfig({
      username: 'ops-admin',
      passwordHash: await hashPassword('pw-1', FAST),
    });
    const b = new AdminConfig({
      username: 'ops-admin',
      passwordHash: await hashPassword('pw-1', FAST),
    });
    expect(a.actorId).toBe(b.actorId);
    expect(a.credentialTag).toMatch(/^[0-9a-f]{64}$/);
    expect(a.credentialTag).not.toBe(b.credentialTag); // 새 솔트 = 새 해시 = 기존 세션 무효
  });
});
