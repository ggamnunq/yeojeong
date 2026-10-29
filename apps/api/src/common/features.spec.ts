import type { ConfigService } from '@nestjs/config';
import { NotFoundError } from './errors/app-exception.js';
import {
  AccountLinkGuard,
  CardImportGuard,
  FeatureFlags,
  parseBooleanEnv,
} from './features.js';

// ConfigService는 process.env(테스트 env는 플래그를 켠다)를 먼저 읽으므로 값만 돌려주는 가짜를 쓴다
const flagsWith = (value: string | undefined) =>
  new FeatureFlags({
    get: (name: string) =>
      name === 'FEATURE_ACCOUNT_LINK' ? value : undefined,
  } as unknown as ConfigService);

describe('기능 플래그(FR-006)', () => {
  it('defaults accountLink to false and accepts only true/false', () => {
    expect(flagsWith(undefined).view()).toEqual({
      accountLink: false,
      cardImport: false,
    });
    expect(flagsWith('').accountLink).toBe(false);
    expect(flagsWith('TRUE').accountLink).toBe(true);
    expect(flagsWith(' false ').accountLink).toBe(false);
    expect(() => parseBooleanEnv('FEATURE_ACCOUNT_LINK', 'yes', false)).toThrow(
      /true 또는 false/,
    );
  });

  it('hides account-link routes with 404 while off', () => {
    const ctx = {} as never;
    expect(() =>
      new AccountLinkGuard(flagsWith('false')).canActivate(ctx),
    ).toThrow(NotFoundError);
    expect(new AccountLinkGuard(flagsWith('true')).canActivate(ctx)).toBe(true);
  });

  it('resolves cardImport per user: off | allowlist | on, and off without CODEF keys (S8)', () => {
    const flags = (env: Record<string, string>) =>
      new FeatureFlags({
        get: (name: string) => env[name],
      } as unknown as ConfigService);
    const keys = {
      CODEF_CLIENT_ID: 'id',
      CODEF_CLIENT_SECRET: 'secret',
      CODEF_PUBLIC_KEY: 'key',
    };
    const me = '11111111-1111-4111-8111-111111111111';
    const other = '22222222-2222-4222-8222-222222222222';
    expect(flags({}).cardImportMode).toBe('off');
    expect(flags(keys).cardImportFor(me)).toBe(false);
    // 키가 없으면 on이어도 꺼진다
    expect(flags({ FEATURE_CARD_IMPORT: 'on' }).cardImportFor(me)).toBe(false);
    expect(
      flags({ FEATURE_CARD_IMPORT: 'on', ...keys, CODEF_PUBLIC_KEY: ' ' })
        .cardImportMode,
    ).toBe('off');
    const on = flags({ FEATURE_CARD_IMPORT: 'ON', ...keys });
    expect(on.cardImportFor(me)).toBe(true);
    expect(on.cardImportFor(undefined)).toBe(true);
    const allow = flags({
      FEATURE_CARD_IMPORT: 'allowlist',
      CARD_IMPORT_ALLOWED_USER_IDS: ` ${me.toUpperCase()} ,`,
      ...keys,
    });
    expect(allow.cardImportFor(me)).toBe(true);
    expect(allow.cardImportFor(other)).toBe(false);
    expect(allow.cardImportFor(null)).toBe(false);
    expect(allow.view(me)).toEqual({ accountLink: false, cardImport: true });
    expect(allow.view(other)).toEqual({
      accountLink: false,
      cardImport: false,
    });
    expect(() => flags({ FEATURE_CARD_IMPORT: 'true', ...keys })).toThrow(
      /off·allowlist·on/,
    );
    expect(() =>
      flags({
        FEATURE_CARD_IMPORT: 'allowlist',
        CARD_IMPORT_ALLOWED_USER_IDS: 'nope',
        ...keys,
      }),
    ).toThrow(/UUID/);

    // 운영에서는 importKey 전용 키도 있어야 켜진다
    expect(
      flags({ NODE_ENV: 'production', FEATURE_CARD_IMPORT: 'on', ...keys })
        .cardImportMode,
    ).toBe('off');
    expect(
      flags({
        NODE_ENV: 'production',
        FEATURE_CARD_IMPORT: 'on',
        IMPORT_KEY_HMAC_KEY: 'k'.repeat(64),
        ...keys,
      }).cardImportMode,
    ).toBe('on');

    const ctx = (userId?: string) =>
      ({
        switchToHttp: () => ({
          getRequest: () => ({
            auth: userId ? { user: { id: userId } } : undefined,
          }),
        }),
      }) as never;
    expect(() => new CardImportGuard(allow).canActivate(ctx(other))).toThrow(
      NotFoundError,
    );
    expect(new CardImportGuard(allow).canActivate(ctx(me))).toBe(true);
    expect(() => new CardImportGuard(flags(keys)).canActivate(ctx(me))).toThrow(
      NotFoundError,
    );
  });
});
