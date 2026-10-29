import type { ConfigService } from '@nestjs/config';
import type { PrismaService } from '../prisma/prisma.service.js';
import { NotFoundError } from './errors/app-exception.js';
import {
  AccountLinkGuard,
  CardImportAccess,
  CardImportGuard,
  FeatureFlags,
  FileImportGuard,
  parseBooleanEnv,
  parseFileImportMode,
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
    });
    expect(allow.view(other)).toEqual({
      accountLink: false,
      cardImport: false,
      fileImport: false,
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

describe('카드 불러오기 권한 판정(CardImportAccess = env + 관리자 권한)', () => {
  const keys = {
    CODEF_CLIENT_ID: 'id',
    CODEF_CLIENT_SECRET: 'secret',
    CODEF_PUBLIC_KEY: 'key',
  };
  const envUser = '11111111-1111-4111-8111-111111111111';
  const granted = '22222222-2222-4222-8222-222222222222';
  const nobody = '33333333-3333-4333-8333-333333333333';

  /** card_import_grants 가짜: granted 한 명만 있고, 조회 수를 센다 */
  function setup(mode: string, grants = new Set([granted])) {
    const flags = new FeatureFlags({
      get: (name: string) =>
        ({
          FEATURE_CARD_IMPORT: mode,
          CARD_IMPORT_ALLOWED_USER_IDS: envUser,
          ...keys,
        })[name],
    } as unknown as ConfigService);
    const findUnique = vi.fn(({ where }: { where: { userId: string } }) =>
      Promise.resolve(
        grants.has(where.userId) ? { userId: where.userId } : null,
      ),
    );
    const prisma = {
      cardImportGrant: { findUnique },
    } as unknown as PrismaService;
    return { access: new CardImportAccess(flags, prisma), findUnique, grants };
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

  it('allowlist: env 목록 또는 관리자 권한이 있으면 켜진다(env는 DB를 보지 않는다)', async () => {
    const { access, findUnique } = setup('allowlist');
    expect(await access.enabledFor(envUser)).toBe(true);
    expect(findUnique).not.toHaveBeenCalled();
    expect(await access.enabledFor(granted)).toBe(true);
    expect(await access.enabledFor(nobody)).toBe(false);
    expect(await access.enabledFor(null)).toBe(false);
    // UUID가 아니면 DB를 보지 않는다
    expect(await access.enabledFor('not-a-uuid')).toBe(false);
    expect(findUnique).toHaveBeenCalledTimes(2);
    expect(await access.view(granted)).toEqual({
      accountLink: false,
      cardImport: true,
    });
    expect(await access.view(nobody)).toEqual({
      accountLink: false,
      cardImport: false,
    });
    expect(access.enabledWithGrant(nobody, true)).toBe(true);
    expect(access.enabledWithGrant(nobody, false)).toBe(false);
    expect(access.enabledWithGrant(envUser, false)).toBe(true);
  });

  it('off·on은 권한 행과 무관하다(DB를 보지 않는다)', async () => {
    const off = setup('off');
    expect(await off.access.enabledFor(granted)).toBe(false);
    expect(await off.access.enabledFor(envUser)).toBe(false);
    expect((await off.access.view(granted)).cardImport).toBe(false);
    expect(off.access.enabledWithGrant(granted, true)).toBe(false);
    const on = setup('on');
    expect(await on.access.enabledFor(nobody)).toBe(true);
    expect(await on.access.enabledFor(undefined)).toBe(true);
    expect(off.findUnique).not.toHaveBeenCalled();
    expect(on.findUnique).not.toHaveBeenCalled();
  });

  it('같은 요청 안에서는 한 번만 읽고, 다음 요청은 다시 읽는다(회수가 바로 반영된다)', async () => {
    const { access, findUnique, grants } = setup('allowlist');
    const req = {};
    expect((await access.view(granted, req)).cardImport).toBe(true);
    expect(await access.enabledFor(granted, req)).toBe(true);
    expect(findUnique).toHaveBeenCalledTimes(1);
    grants.delete(granted);
    expect(await access.enabledFor(granted, {})).toBe(false);
    expect(findUnique).toHaveBeenCalledTimes(2);
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

  it('turns fileImport on only with FEATURE_FILE_IMPORT=on, and in production only with IMPORT_KEY_HMAC_KEY (W10)', () => {
    const flags = (env: Record<string, string>) =>
      new FeatureFlags({
        get: (name: string) => env[name],
      } as unknown as ConfigService);
    expect(flags({}).fileImport).toBe(false);
    expect(flags({ FEATURE_FILE_IMPORT: 'off' }).fileImport).toBe(false);
    expect(flags({ FEATURE_FILE_IMPORT: ' ON ' }).fileImport).toBe(true);
    expect(flags({ FEATURE_FILE_IMPORT: 'on' }).view()).toEqual({
      accountLink: false,
      cardImport: false,
      fileImport: true,
    });
    expect(parseFileImportMode(undefined)).toBe('off');
    expect(() => flags({ FEATURE_FILE_IMPORT: 'true' })).toThrow(/off·on/);
    expect(() => parseFileImportMode('allowlist')).toThrow(/off·on/);
    // 운영: importKey 전용 키가 없으면 꺼진다
    expect(
      flags({ NODE_ENV: 'production', FEATURE_FILE_IMPORT: 'on' }).fileImport,
    ).toBe(false);
    expect(
      flags({
        NODE_ENV: 'production',
        FEATURE_FILE_IMPORT: 'on',
        IMPORT_KEY_HMAC_KEY: 'k'.repeat(64),
      }).fileImport,
    ).toBe(true);

    const ctx = {} as never;
    expect(() => new FileImportGuard(flags({})).canActivate(ctx)).toThrow(
      NotFoundError,
    );
    expect(
      new FileImportGuard(flags({ FEATURE_FILE_IMPORT: 'on' })).canActivate(
        ctx,
      ),
    ).toBe(true);
  });
});
