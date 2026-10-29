import type { ConfigService } from '@nestjs/config';
import { ImportKeyHasher as Hasher } from './import-key.js';

// ConfigService는 process.env(테스트 env에 키가 있다)를 먼저 읽으므로 값만 돌려주는 가짜를 쓴다
const config = (env: Record<string, string>) =>
  ({ get: (name: string) => env[name] }) as unknown as ConfigService;
class ImportKeyHasher extends Hasher {
  constructor(env: Record<string, string>) {
    super(config(env));
  }
}

describe('ImportKeyHasher (IMPORT_KEY_HMAC_KEY)', () => {
  const key = 'k'.repeat(64);

  it('hashes with the dedicated key, independent of TOKEN_ENCRYPTION_KEY', () => {
    const a = new ImportKeyHasher({
      IMPORT_KEY_HMAC_KEY: key,
      TOKEN_ENCRYPTION_KEY: 'x',
    });
    const b = new ImportKeyHasher({
      IMPORT_KEY_HMAC_KEY: key,
      TOKEN_ENCRYPTION_KEY: 'y',
    });
    const other = new ImportKeyHasher({ IMPORT_KEY_HMAC_KEY: 'z'.repeat(64) });
    expect(a.hash('m')).toMatch(/^[0-9a-f]{64}$/);
    expect(a.hash('m')).toBe(b.hash('m'));
    expect(other.hash('m')).not.toBe(a.hash('m'));
  });

  it('uses a fixed dev key outside production and refuses without a key in production', () => {
    const dev = new ImportKeyHasher({ NODE_ENV: 'test' });
    expect(dev.hash('m')).toBe(new ImportKeyHasher({}).hash('m'));
    const prod = new ImportKeyHasher({ NODE_ENV: 'production' });
    expect(() => prod.hash('m')).toThrow(/IMPORT_KEY_HMAC_KEY/);
    expect(() => new ImportKeyHasher({ IMPORT_KEY_HMAC_KEY: 'short' })).toThrow(
      /32자/,
    );
  });
});
