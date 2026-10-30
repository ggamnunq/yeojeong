import type { ConfigService } from '@nestjs/config';
import type { FeatureKey } from '@yeojeong/shared';
import type { PrismaService } from '../prisma/prisma.service.js';
import { NotFoundError } from './errors/app-exception.js';
import {
  AccountLinkGuard,
  CardImportGuard,
  FeatureAccess,
  FeatureFlags,
  FileImportGuard,
  parseBooleanEnv,
  parseFileImportMode,
  parseFileImportProviders,
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
      fileImport: false,
      fileImportProviders: [],
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
    expect(allow.view(me)).toEqual({
      accountLink: false,
      cardImport: true,
      fileImport: false,
      fileImportProviders: [],
    });
    expect(allow.view(other)).toEqual({
      accountLink: false,
      cardImport: false,
      fileImport: false,
      fileImportProviders: [],
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
  });
});

describe('회원별 기능 판정(FeatureAccess = env + 관리자 권한 feature_grants)', () => {
  const keys = {
    CODEF_CLIENT_ID: 'id',
    CODEF_CLIENT_SECRET: 'secret',
    CODEF_PUBLIC_KEY: 'key',
  };
  const envUser = '11111111-1111-4111-8111-111111111111';
  const granted = '22222222-2222-4222-8222-222222222222';
  const nobody = '33333333-3333-4333-8333-333333333333';
  const set = (features: FeatureKey[]): ReadonlySet<FeatureKey> =>
    new Set(features);

  /** feature_grants 가짜: 회원별 기능 키 목록, 조회 수를 센다 */
  function setup(
    mode: string,
    grants = new Map<string, FeatureKey[]>([[granted, ['CARD_IMPORT']]]),
    env: Record<string, string> = {},
  ) {
    const flags = new FeatureFlags({
      get: (name: string) =>
        ({
          FEATURE_CARD_IMPORT: mode,
          CARD_IMPORT_ALLOWED_USER_IDS: envUser,
          ...keys,
          ...env,
        })[name],
    } as unknown as ConfigService);
    const findMany = vi.fn(({ where }: { where: { userId: string } }) =>
      Promise.resolve(
        (grants.get(where.userId) ?? []).map((feature) => ({ feature })),
      ),
    );
    const prisma = {
      featureGrant: { findMany },
    } as unknown as PrismaService;
    return { access: new FeatureAccess(flags, prisma), findMany, grants };
  }

  const ctx = (userId?: string, req: object = {}) =>
    ({
      switchToHttp: () => ({
        getRequest: () => ({
          ...req,
          auth: userId ? { user: { id: userId } } : undefined,
        }),
      }),
    }) as never;

  it('카드 allowlist: env 목록 또는 관리자 권한이 있으면 켜진다(env는 DB를 보지 않는다)', async () => {
    const { access, findMany } = setup('allowlist');
    expect(await access.cardImportFor(envUser)).toBe(true);
    expect(findMany).not.toHaveBeenCalled();
    expect(await access.cardImportFor(granted)).toBe(true);
    expect(await access.cardImportFor(nobody)).toBe(false);
    expect(await access.cardImportFor(null)).toBe(false);
    // UUID가 아니면 DB를 보지 않는다
    expect(await access.cardImportFor('not-a-uuid')).toBe(false);
    expect(findMany).toHaveBeenCalledTimes(2);
    expect(await access.view(granted)).toEqual({
      accountLink: false,
      cardImport: true,
      fileImport: false,
      fileImportProviders: [],
    });
    expect(await access.view(nobody)).toEqual({
      accountLink: false,
      cardImport: false,
      fileImport: false,
      fileImportProviders: [],
    });
    expect(
      access.enabledWithGrants(nobody, 'CARD_IMPORT', set(['CARD_IMPORT'])),
    ).toBe(true);
    expect(access.enabledWithGrants(nobody, 'CARD_IMPORT', set([]))).toBe(
      false,
    );
    expect(access.enabledWithGrants(envUser, 'CARD_IMPORT', set([]))).toBe(
      true,
    );
  });

  it('카드 off·on은 권한 행과 무관하다(DB를 보지 않는다)', async () => {
    const off = setup('off');
    expect(await off.access.cardImportFor(granted)).toBe(false);
    expect(await off.access.cardImportFor(envUser)).toBe(false);
    expect((await off.access.view(granted)).cardImport).toBe(false);
    expect(
      off.access.enabledWithGrants(
        granted,
        'CARD_IMPORT',
        set(['CARD_IMPORT']),
      ),
    ).toBe(false);
    const on = setup('on');
    expect(await on.access.cardImportFor(nobody)).toBe(true);
    expect(await on.access.cardImportFor(undefined)).toBe(true);
    expect(off.findMany).not.toHaveBeenCalled();
    expect(on.findMany).not.toHaveBeenCalled();
  });

  it('같은 요청 안에서는 한 번만 읽고(카드·파일 판정 함께), 다음 요청은 다시 읽는다(회수가 바로 반영된다)', async () => {
    const { access, findMany, grants } = setup(
      'allowlist',
      new Map<string, FeatureKey[]>([
        [granted, ['CARD_IMPORT', 'FILE_IMPORT_WECHAT']],
      ]),
      { FEATURE_FILE_IMPORT: 'allowlist' },
    );
    const req = {};
    expect(await access.view(granted, req)).toMatchObject({
      cardImport: true,
      fileImport: true,
      fileImportProviders: ['WECHAT'],
    });
    expect(await access.cardImportFor(granted, req)).toBe(true);
    expect(await access.fileImportFor(granted, 'WECHAT', req)).toBe(true);
    expect(findMany).toHaveBeenCalledTimes(1);
    grants.delete(granted);
    expect(await access.cardImportFor(granted, {})).toBe(false);
    expect(findMany).toHaveBeenCalledTimes(2);
  });

  it('CardImportGuard: 꺼진 사용자는 404, env·관리자 권한이면 통과', async () => {
    const { access } = setup('allowlist');
    await expect(
      new CardImportGuard(access).canActivate(ctx(nobody)),
    ).rejects.toThrow(NotFoundError);
    await expect(
      new CardImportGuard(access).canActivate(ctx(undefined)),
    ).rejects.toThrow(NotFoundError);
    expect(await new CardImportGuard(access).canActivate(ctx(envUser))).toBe(
      true,
    );
    expect(await new CardImportGuard(access).canActivate(ctx(granted))).toBe(
      true,
    );
    const off = setup('off');
    await expect(
      new CardImportGuard(off.access).canActivate(ctx(granted)),
    ).rejects.toThrow(NotFoundError);
  });

  it('파일 allowlist: 공급자별 권한 ∩ FILE_IMPORT_PROVIDERS인 공급자만 켜진다(카드 env 목록은 파일과 무관)', async () => {
    const wechatOnly = '44444444-4444-4444-8444-444444444444';
    const both = '55555555-5555-4555-8555-555555555555';
    const grants = new Map<string, FeatureKey[]>([
      [wechatOnly, ['FILE_IMPORT_WECHAT']],
      [both, ['FILE_IMPORT_WECHAT', 'FILE_IMPORT_ALIPAY']],
      [granted, ['FILE_IMPORT_ALIPAY']],
    ]);
    // 공급자 목록에 알리페이가 없으면 알리페이 권한이 있어도 꺼져 있다
    const wechatListed = setup('off', grants, {
      FEATURE_FILE_IMPORT: 'allowlist',
    });
    expect(await wechatListed.access.fileImportProvidersFor(both)).toEqual([
      'WECHAT',
    ]);
    expect(await wechatListed.access.fileImportProvidersFor(granted)).toEqual(
      [],
    );
    expect(await wechatListed.access.fileImportFor(granted, 'ALIPAY')).toBe(
      false,
    );

    const { access } = setup('off', grants, {
      FEATURE_FILE_IMPORT: 'allowlist',
      FILE_IMPORT_PROVIDERS: 'WECHAT,ALIPAY',
    });
    expect(await access.fileImportProvidersFor(wechatOnly)).toEqual(['WECHAT']);
    expect(await access.fileImportProvidersFor(both)).toEqual([
      'WECHAT',
      'ALIPAY',
    ]);
    expect(await access.fileImportProvidersFor(granted)).toEqual(['ALIPAY']);
    expect(await access.fileImportProvidersFor(nobody)).toEqual([]);
    // 카드 env 목록에 있어도 파일 권한은 없다
    expect(await access.fileImportProvidersFor(envUser)).toEqual([]);
    expect(await access.fileImportProvidersFor(null)).toEqual([]);
    expect(await access.view(granted)).toEqual({
      accountLink: false,
      cardImport: false,
      fileImport: true,
      fileImportProviders: ['ALIPAY'],
    });
    expect(await access.view(nobody)).toMatchObject({
      fileImport: false,
      fileImportProviders: [],
    });
    expect(
      access.enabledWithGrants(
        nobody,
        'FILE_IMPORT_ALIPAY',
        set(['FILE_IMPORT_ALIPAY']),
      ),
    ).toBe(true);
    expect(
      access.enabledWithGrants(
        nobody,
        'FILE_IMPORT_WECHAT',
        set(['FILE_IMPORT_ALIPAY']),
      ),
    ).toBe(false);

    // FileImportGuard: 켜진 공급자가 하나도 없으면 404
    await expect(
      new FileImportGuard(access).canActivate(ctx(nobody)),
    ).rejects.toThrow(NotFoundError);
    await expect(
      new FileImportGuard(access).canActivate(ctx(undefined)),
    ).rejects.toThrow(NotFoundError);
    expect(await new FileImportGuard(access).canActivate(ctx(granted))).toBe(
      true,
    );
  });

  it('파일 on은 모두(DB를 보지 않는다), off는 권한이 있어도 아무도', async () => {
    const grants = new Map<string, FeatureKey[]>([
      [granted, ['FILE_IMPORT_WECHAT']],
    ]);
    const on = setup('off', grants, { FEATURE_FILE_IMPORT: 'on' });
    expect(await on.access.fileImportProvidersFor(nobody)).toEqual(['WECHAT']);
    expect(await on.access.fileImportProvidersFor(undefined)).toEqual([
      'WECHAT',
    ]);
    expect(await new FileImportGuard(on.access).canActivate(ctx(nobody))).toBe(
      true,
    );
    expect(on.findMany).not.toHaveBeenCalled();
    const off = setup('off', grants, { FEATURE_FILE_IMPORT: 'off' });
    expect(await off.access.fileImportProvidersFor(granted)).toEqual([]);
    await expect(
      new FileImportGuard(off.access).canActivate(ctx(granted)),
    ).rejects.toThrow(NotFoundError);
    expect(off.findMany).not.toHaveBeenCalled();
  });

  it('FEATURE_FILE_IMPORT is off | allowlist | on, and in production only with IMPORT_KEY_HMAC_KEY (W10 · ADMIN3)', () => {
    const flags = (env: Record<string, string>) =>
      new FeatureFlags({
        get: (name: string) => env[name],
      } as unknown as ConfigService);
    expect(flags({}).fileImportMode).toBe('off');
    expect(flags({ FEATURE_FILE_IMPORT: 'off' }).fileImportMode).toBe('off');
    expect(flags({ FEATURE_FILE_IMPORT: ' ON ' }).fileImportMode).toBe('on');
    expect(flags({ FEATURE_FILE_IMPORT: 'Allowlist' }).fileImportMode).toBe(
      'allowlist',
    );
    expect(flags({ FEATURE_FILE_IMPORT: 'on' }).view()).toEqual({
      accountLink: false,
      cardImport: false,
      fileImport: true,
      fileImportProviders: ['WECHAT'],
    });
    // allowlist는 env만으로는 아무에게도 켜지지 않는다(회원별 판정은 FeatureAccess)
    const allow = flags({ FEATURE_FILE_IMPORT: 'allowlist' });
    expect(allow.view('11111111-1111-4111-8111-111111111111')).toMatchObject({
      fileImport: false,
      fileImportProviders: [],
    });
    expect(allow.fileImportProviderEnabled('WECHAT')).toBe(true);
    expect(parseFileImportMode(undefined)).toBe('off');
    expect(() => flags({ FEATURE_FILE_IMPORT: 'true' })).toThrow(
      /off·allowlist·on/,
    );
    // 운영: importKey 전용 키가 없으면 꺼진다(설정 값은 그대로 보인다)
    const noKey = flags({ NODE_ENV: 'production', FEATURE_FILE_IMPORT: 'on' });
    expect(noKey.fileImportMode).toBe('off');
    expect(noKey.fileImportConfiguredMode).toBe('on');
    expect(noKey.fileImportProviders).toEqual([]);
    expect(
      flags({
        NODE_ENV: 'production',
        FEATURE_FILE_IMPORT: 'allowlist',
        IMPORT_KEY_HMAC_KEY: 'k'.repeat(64),
      }).fileImportMode,
    ).toBe('allowlist');
  });

  it('FILE_IMPORT_PROVIDERS picks providers (default WECHAT only — ALIPAY off unless listed), unknown values stop boot (W11)', () => {
    const flags = (env: Record<string, string>) =>
      new FeatureFlags({
        get: (name: string) => env[name],
      } as unknown as ConfigService);
    expect(parseFileImportProviders(undefined)).toEqual(['WECHAT']);
    expect(parseFileImportProviders(' ')).toEqual(['WECHAT']);
    expect(parseFileImportProviders('alipay, wechat,ALIPAY')).toEqual([
      'WECHAT',
      'ALIPAY',
    ]);
    expect(parseFileImportProviders('ALIPAY')).toEqual(['ALIPAY']);
    expect(() => parseFileImportProviders('WECHAT,PAYPAL')).toThrow(
      /FILE_IMPORT_PROVIDERS.*PAYPAL/,
    );
    // 기능이 꺼져 있어도 잘못된 값이면 부팅을 멈춘다
    expect(() => flags({ FILE_IMPORT_PROVIDERS: 'X' })).toThrow(
      /FILE_IMPORT_PROVIDERS/,
    );

    const on = flags({ FEATURE_FILE_IMPORT: 'on' });
    expect(on.fileImportProviderEnabled('WECHAT')).toBe(true);
    expect(on.fileImportProviderEnabled('ALIPAY')).toBe(false);
    const both = flags({
      FEATURE_FILE_IMPORT: 'on',
      FILE_IMPORT_PROVIDERS: 'WECHAT,ALIPAY',
    });
    expect(both.fileImportProviderEnabled('ALIPAY')).toBe(true);
    expect(both.view().fileImportProviders).toEqual(['WECHAT', 'ALIPAY']);
    // 전체 플래그가 꺼져 있으면 공급자 목록과 무관하게 아무것도 켜지지 않는다
    const off = flags({ FILE_IMPORT_PROVIDERS: 'WECHAT,ALIPAY' });
    expect(off.fileImportProviderEnabled('ALIPAY')).toBe(false);
    expect(off.view()).toMatchObject({
      fileImport: false,
      fileImportProviders: [],
    });
  });
});
