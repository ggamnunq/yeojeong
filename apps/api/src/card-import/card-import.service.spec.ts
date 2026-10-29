import { ConfigService } from '@nestjs/config';
import type { FetchCardApprovalsRequest } from '@yeojeong/shared';
import {
  DOC_SAMPLE_ROW,
  mixedRows,
} from '../../test/fixtures/codef-approvals.js';
import {
  codefHttpMock,
  codefResult,
  type CodefRoute,
} from '../../test/fakes/codef-http.js';
import { AppException } from '../common/errors/index.js';
import { CardImportService, periodErrors } from './card-import.service.js';
import { CodefAccountRemover } from './codef/codef-account-remover.js';
import { ImportKeyHasher } from './import-key.js';
import { ItemTokenSigner } from './item-token.js';
import { CodefClient } from './codef/codef.client.js';
import { CodefConfig } from './codef/codef.config.js';
import {
  CARD_IMPORT_ORGANIZATIONS,
  CARD_NUMBER_LOGIN_ENABLED,
  CODEF_PATHS,
  organizationOf,
} from './codef/codef.constants.js';
import { TwoWayTokenSealer } from './two-way-token.js';

const KEY = Buffer.alloc(32, 3).toString('base64');
const USER = '11111111-1111-4111-8111-111111111111';
const NOW = new Date('2026-11-13T06:00:00Z'); // KST 15:00
const TRIP_ID = '33333333-3333-4333-8333-333333333333';
const LOGIN_ID = 'my-card-login-id';
const CIPHERTEXT = 'Q0lQSEVSVEVYVC1CQVNFNjQtVkFMVUU=';

function setup(
  routes: Record<string, CodefRoute>,
  options: { mode?: 'direct' | 'account' } = {},
) {
  const env = new ConfigService({
    CODEF_ENV: 'sandbox',
    CODEF_LOGIN_MODE: options.mode ?? 'direct',
    CODEF_CLIENT_ID: 'id',
    CODEF_CLIENT_SECRET: 'secret',
    CODEF_PUBLIC_KEY: 'PUBLICKEY',
    TOKEN_ENCRYPTION_KEY: KEY,
  });
  const http = codefHttpMock(routes);
  const config = new CodefConfig(env);
  const client = new CodefClient(config, http.fetch);
  // 읽기만 있는 가짜 DB. 조회 결과를 쓰려고 하면 메서드가 없어 실패한다
  const pendingCreate = vi.fn().mockResolvedValue({});
  const prisma = {
    trip: {
      findFirst: vi.fn().mockResolvedValue(null),
      // 자동 연결 후보: 11.12~11.15 진행 중 여정
      findMany: vi.fn().mockResolvedValue([
        {
          id: TRIP_ID,
          status: 'ONGOING',
          currency: 'KRW',
          startAt: new Date('2026-11-12T00:00:00+09:00'),
          autoEndAt: new Date('2026-11-15T23:59:59+09:00'),
        },
      ]),
    },
    transaction: { findMany: vi.fn().mockResolvedValue([]) },
    codefPendingDeletion: { create: pendingCreate },
  };
  const release = vi.fn().mockResolvedValue(undefined);
  const limits = {
    acquire: vi.fn().mockResolvedValue(release),
    checkStart: vi.fn().mockResolvedValue(undefined),
    remainingToday: vi.fn().mockResolvedValue(10),
    loginSucceeded: vi.fn().mockResolvedValue(undefined),
    loginFailed: vi.fn(() =>
      Promise.reject(
        AppException.of('CARD_LOGIN_FAILED', {
          details: { failedAttempts: 1 },
        }),
      ),
    ),
  };
  const audit = { record: vi.fn().mockResolvedValue('log-id') };
  const remover = new CodefAccountRemover(client, prisma as never, env);
  remover.delays = [0, 0];
  const service = new CardImportService(
    prisma as never,
    client,
    config,
    new TwoWayTokenSealer(env),
    new ImportKeyHasher(env),
    { findMissing: vi.fn().mockResolvedValue([]) } as never,
    audit as never,
    { findSpotRate: vi.fn().mockResolvedValue(null) } as never,
    remover,
    limits as never,
    new ItemTokenSigner(env),
  );
  return { service, http, prisma, audit, pendingCreate, limits, release };
}

const request = (
  over: Partial<FetchCardApprovalsRequest> = {},
): FetchCardApprovalsRequest => ({
  organization: '0306',
  loginId: LOGIN_ID,
  encryptedPassword: CIPHERTEXT,
  from: '2026-11-10',
  to: '2026-11-13',
  ...over,
});

const codeOf = async (promise: Promise<unknown>) => {
  try {
    await promise;
  } catch (error) {
    return (error as AppException).code;
  }
  return null;
};

describe('CardImportService.fetch (direct)', () => {
  it('logs in inside the approval request, creates no CODEF account and writes nothing', async () => {
    const { service, http, prisma, audit } = setup({
      [CODEF_PATHS.CARD_APPROVAL_LIST]: () =>
        codefResult('CF-00000', mixedRows('2026-11-13')),
    });
    const res = await service.fetch(USER, request(), NOW);
    expect(res.status).toBe('OK');
    if (res.status !== 'OK') return;
    expect(res.items.map((i) => i.cancelState)).toEqual([
      'NONE',
      'CANCELLED',
      'PARTIAL',
      'ORPHAN_CANCEL',
    ]);
    expect(res.items[0]).toMatchObject({
      organization: '0306',
      organizationName: '신한카드',
      status: 'NEW',
      inTripId: TRIP_ID,
      selectable: true,
      defaultSelected: true,
      blockReason: null,
      alreadyImported: false,
      itemToken: expect.stringMatching(/^\d{10}\.[A-Za-z0-9_-]{43}$/),
    });
    expect(res.items[1]).toMatchObject({
      status: 'CANCELLED',
      selectable: false,
      blockReason: 'CANCELLED',
      itemToken: null,
    });
    expect(res.items[2]).toMatchObject({
      status: 'PARTIAL_CANCEL',
      amount: '18000',
    });
    expect(res.items[3]).toMatchObject({
      status: 'CANCELLED',
      amount: '-5000',
      selectable: false,
      blockReason: 'ORPHAN_CANCEL',
    });

    expect(http.calls.map((c) => c.path)).toEqual([
      CODEF_PATHS.CARD_APPROVAL_LIST,
    ]);
    expect(http.calls[0].body).toEqual({
      organization: '0306',
      loginType: '1',
      id: LOGIN_ID,
      password: CIPHERTEXT,
      startDate: '20261110',
      endDate: '20261113',
      orderBy: '0',
      inquiryType: '1',
      memberStoreInfoType: '0',
    });
    // 쓰기 메서드가 아예 없다(조회 결과는 DB에 가지 않는다)
    expect(Object.keys(prisma.transaction)).toEqual(['findMany']);
    // 접근 기록: 기관 코드·건수·결과 코드만
    expect(audit.record).toHaveBeenCalledWith({
      userId: USER,
      action: 'FETCH_CARD_APPROVALS',
      resourceType: 'USER',
      resourceId: USER,
      details: { organization: '0306', count: 4, result: 'OK', step: 'START' },
    });
    const logged = JSON.stringify(audit.record.mock.calls);
    expect(logged).not.toContain(LOGIN_ID);
    expect(logged).not.toContain(CIPHERTEXT);
  });

  it('marks already imported and similar manual entries', async () => {
    const { service, prisma } = setup({
      [CODEF_PATHS.CARD_APPROVAL_LIST]: () =>
        codefResult('CF-00000', [
          { ...DOC_SAMPLE_ROW, resUsedDate: '20261112', resApprovalNo: 'X1' },
          { ...DOC_SAMPLE_ROW, resUsedDate: '20261111', resApprovalNo: 'X2' },
        ]),
    });
    const first = await service.fetch(USER, request(), NOW);
    if (first.status !== 'OK') throw new Error('expected OK');
    const [newer, older] = first.items;
    const { Prisma } = await import('../generated/prisma/client.js');
    prisma.transaction.findMany
      .mockResolvedValueOnce([{ externalRef: newer.importKey }])
      .mockResolvedValueOnce([
        {
          id: 'manual-1',
          occurredAt: new Date('2026-11-11T12:20:00+09:00'),
          originalAmount: new Prisma.Decimal('22000'),
          originalCurrency: 'KRW',
        },
      ]);
    const second = await service.fetch(USER, request(), NOW);
    if (second.status !== 'OK') throw new Error('expected OK');
    expect(second.items[0]).toMatchObject({
      importKey: newer.importKey,
      status: 'ALREADY_IMPORTED',
      alreadyImported: true,
      selectable: false,
      blockReason: 'ALREADY_IMPORTED',
    });
    expect(second.items[1]).toMatchObject({
      importKey: older.importKey,
      status: 'SIMILAR',
      similarManualEntryId: 'manual-1',
      selectable: true,
      defaultSelected: false,
      // 11.11은 여정(11.12~) 밖
      inTripId: null,
    });
  });

  it('continues a 2-way flow statelessly with the sealed token', async () => {
    const { service, http, limits, release } = setup({
      [CODEF_PATHS.CARD_APPROVAL_LIST]: (_body, n) =>
        n === 0
          ? codefResult('CF-03002', {
              continue2Way: true,
              method: 'smsAuthNo',
              jobIndex: 0,
              threadIndex: 0,
              jti: 'jti-1',
              twoWayTimestamp: 1793260000000,
              extraInfo: { reqSMSAuthNo: '010-****-1234' },
            })
          : codefResult('CF-00000', [DOC_SAMPLE_ROW]),
    });
    const lotte = request({ organization: '0311' });
    const first = await service.fetch(USER, lotte, NOW);
    expect(first).toMatchObject({
      status: 'TWO_WAY_REQUIRED',
      method: 'SMS',
      expiresAt: '2026-11-13T15:02:40+09:00',
    });
    if (first.status !== 'TWO_WAY_REQUIRED') return;
    expect(JSON.stringify(first)).not.toContain('010');

    // 다른 사용자·다른 아이디로는 이어갈 수 없다
    expect(
      await codeOf(
        service.fetch(
          '22222222-2222-4222-8222-222222222222',
          { ...lotte, twoWay: { token: first.twoWayToken, code: '123456' } },
          NOW,
        ),
      ),
    ).toBe('CARD_TWO_WAY_EXPIRED');
    expect(
      await codeOf(
        service.fetch(
          USER,
          {
            ...lotte,
            loginId: 'other',
            twoWay: { token: first.twoWayToken, code: '123456' },
          },
          NOW,
        ),
      ),
    ).toBe('CARD_TWO_WAY_EXPIRED');

    const done = await service.fetch(
      USER,
      { ...lotte, twoWay: { token: first.twoWayToken, code: '123456' } },
      new Date(NOW.getTime() + 60_000),
    );
    expect(done.status).toBe('OK');
    expect(http.calls[1].body).toMatchObject({
      organization: '0311',
      id: LOGIN_ID,
      password: CIPHERTEXT,
      is2Way: true,
      twoWayInfo: {
        jobIndex: 0,
        threadIndex: 0,
        jti: 'jti-1',
        twoWayTimestamp: 1793260000000,
      },
      smsAuthNo: '123456',
    });
    // 이어가기는 조회 제한을 다시 세지 않는다(새 조회만). 토큰이 안 맞는 요청은 잠금 전에 거절, 나머지는 잡고 푼다
    expect(limits.checkStart).toHaveBeenCalledTimes(1);
    expect(limits.acquire).toHaveBeenCalledTimes(2);
    expect(release).toHaveBeenCalledTimes(2);
    expect(limits.loginSucceeded).toHaveBeenCalledWith(USER, '0311');
    // 만료 뒤에는 410
    expect(
      await codeOf(
        service.fetch(
          USER,
          { ...lotte, twoWay: { token: first.twoWayToken, code: '123456' } },
          new Date(NOW.getTime() + 161_000),
        ),
      ),
    ).toBe('CARD_TWO_WAY_EXPIRED');
  });

  it.each([
    ['CF-12801', 'CARD_LOGIN_FAILED'],
    ['CF-12803', 'CARD_LOGIN_FAILED'],
    ['CF-12802', 'CARD_ACCOUNT_ACTION_REQUIRED'],
    ['CF-12834', 'CARD_ACCOUNT_ACTION_REQUIRED'],
    ['CF-12041', 'CARD_COMPANY_UNAVAILABLE'],
    ['CF-12001', 'CARD_TWO_WAY_EXPIRED'],
    ['CF-04020', 'CARD_PASSWORD_ENCRYPTION_INVALID'],
    ['CF-99999', 'CARD_IMPORT_FAILED'],
  ])('maps %s to %s and records the code', async (codefCode, ours) => {
    const { service, audit } = setup({
      [CODEF_PATHS.CARD_APPROVAL_LIST]: () => codefResult(codefCode, {}),
    });
    expect(await codeOf(service.fetch(USER, request(), NOW))).toBe(ours);
    expect(audit.record).toHaveBeenCalledWith(
      expect.objectContaining({
        details: {
          organization: '0306',
          count: 0,
          result: ours,
          step: 'START',
        },
      }),
    );
  });

  it('counts login failures and releases the lock', async () => {
    const { service, limits, release, http } = setup({
      [CODEF_PATHS.CARD_APPROVAL_LIST]: () => codefResult('CF-12801', {}),
    });
    const error = await service
      .fetch(USER, request(), NOW)
      .catch((e: unknown) => e);
    expect(error).toMatchObject({
      code: 'CARD_LOGIN_FAILED',
      details: { failedAttempts: 1 },
    });
    expect(limits.loginFailed).toHaveBeenCalledWith(USER, '0306', NOW);
    expect(release).toHaveBeenCalledTimes(1);
    expect(http.calls).toHaveLength(1);
  });

  it('does not call CODEF or record access when a start limit refuses', async () => {
    const { service, limits, release, http, audit } = setup({
      [CODEF_PATHS.CARD_APPROVAL_LIST]: () => codefResult('CF-00000', []),
    });
    limits.checkStart.mockRejectedValueOnce(
      AppException.of('CARD_IMPORT_DAILY_LIMIT'),
    );
    expect(await codeOf(service.fetch(USER, request(), NOW))).toBe(
      'CARD_IMPORT_DAILY_LIMIT',
    );
    expect(http.calls).toHaveLength(0);
    expect(release).toHaveBeenCalledTimes(1);
    expect(audit.record).not.toHaveBeenCalled();
  });

  it('rejects Hyundai and Hana while card-number login is disabled', async () => {
    const { service, http } = setup({
      [CODEF_PATHS.CARD_APPROVAL_LIST]: () => codefResult('CF-00000', []),
    });
    expect(CARD_NUMBER_LOGIN_ENABLED).toBe(false);
    expect(CARD_IMPORT_ORGANIZATIONS.map((o) => o.code)).toEqual([
      '0301',
      '0303',
      '0304',
      '0305',
      '0306',
      '0309',
      '0311',
    ]);
    for (const organization of ['0302', '0313']) {
      expect(
        await codeOf(
          service.fetch(
            USER,
            request({
              organization,
              loginCardNo: '9410123412341934',
              encryptedCardPassword: 'Q0FSRFBBU1NXT1JELUNJUEhFUg==',
            }),
            NOW,
          ),
        ),
      ).toBe('VALIDATION_FAILED');
    }
    expect(http.calls).toHaveLength(0);
  });

  it('checks the period against the card company limits', () => {
    const shinhan = organizationOf('0306')!;
    expect(periodErrors(shinhan, '2026-11-10', '2026-11-13', NOW)).toEqual([]);
    expect(
      periodErrors(shinhan, '2026-11-14', '2026-11-13', NOW).map((e) => e.code),
    ).toEqual(['order']);
    expect(
      periodErrors(shinhan, '2026-11-13', '2026-11-14', NOW).map((e) => e.code),
    ).toEqual(['future']);
    expect(
      periodErrors(shinhan, '2026-08-01', '2026-11-13', NOW).map((e) => e.code),
    ).toEqual(['maxRange']);
    expect(
      periodErrors(shinhan, '2026-05-01', '2026-05-10', NOW).map((e) => e.code),
    ).toEqual(['tooOld']);
  });
});

describe('CardImportService.fetch (account mode)', () => {
  const created = () =>
    codefResult('CF-00000', {
      successList: [{ code: 'CF-00000' }],
      errorList: [],
      connectedId: 'cid-secret-value',
    });

  it('deletes the CODEF account after a successful query', async () => {
    const { service, http } = setup(
      {
        [CODEF_PATHS.ACCOUNT_CREATE]: created,
        [CODEF_PATHS.CARD_APPROVAL_LIST]: () =>
          codefResult('CF-00000', [DOC_SAMPLE_ROW]),
        [CODEF_PATHS.ACCOUNT_DELETE]: () => codefResult('CF-00000', {}),
      },
      { mode: 'account' },
    );
    expect((await service.fetch(USER, request(), NOW)).status).toBe('OK');
    expect(http.calls.map((c) => c.path)).toEqual([
      CODEF_PATHS.ACCOUNT_CREATE,
      CODEF_PATHS.CARD_APPROVAL_LIST,
      CODEF_PATHS.ACCOUNT_DELETE,
    ]);
    expect(http.calls[1].body).toMatchObject({
      connectedId: 'cid-secret-value',
    });
    expect(http.calls[1].body).not.toHaveProperty('password');
    expect(http.calls[2].body).toEqual({
      connectedId: 'cid-secret-value',
      accountList: [
        {
          countryCode: 'KR',
          businessType: 'CD',
          clientType: 'P',
          organization: '0306',
          loginType: '1',
        },
      ],
    });
  });

  it.each([
    ['a CODEF error', () => codefResult('CF-12801', {}), 'CARD_LOGIN_FAILED'],
    [
      'a network failure',
      () => new TypeError('socket hang up'),
      'CARD_IMPORT_FAILED',
    ],
    [
      'a 2-way request',
      () =>
        codefResult('CF-03002', {
          method: 'smsAuthNo',
          jobIndex: 0,
          threadIndex: 0,
          jti: 'j',
          twoWayTimestamp: 1,
        }),
      'CARD_TWO_WAY_UNSUPPORTED',
    ],
  ])('still deletes the account after %s', async (_label, route, expected) => {
    const { service, http } = setup(
      {
        [CODEF_PATHS.ACCOUNT_CREATE]: created,
        [CODEF_PATHS.CARD_APPROVAL_LIST]: route,
        [CODEF_PATHS.ACCOUNT_DELETE]: () => codefResult('CF-00000', {}),
      },
      { mode: 'account' },
    );
    expect(await codeOf(service.fetch(USER, request(), NOW))).toBe(expected);
    expect(http.calls.at(-1)?.path).toBe(CODEF_PATHS.ACCOUNT_DELETE);
  });

  it('maps account/create errorList codes and deletes nothing when no account was made', async () => {
    const { service, http } = setup(
      {
        [CODEF_PATHS.ACCOUNT_CREATE]: () =>
          codefResult('CF-04000', {
            successList: [],
            errorList: [{ code: 'CF-12803' }],
            connectedId: '',
          }),
      },
      { mode: 'account' },
    );
    expect(await codeOf(service.fetch(USER, request(), NOW))).toBe(
      'CARD_LOGIN_FAILED',
    );
    expect(http.calls.map((c) => c.path)).toEqual([CODEF_PATHS.ACCOUNT_CREATE]);
  });

  it('retries the delete 3 times, then queues only the encrypted connectedId', async () => {
    const { service, http, pendingCreate } = setup(
      {
        [CODEF_PATHS.ACCOUNT_CREATE]: created,
        [CODEF_PATHS.CARD_APPROVAL_LIST]: () => codefResult('CF-00000', []),
        [CODEF_PATHS.ACCOUNT_DELETE]: () => codefResult('CF-12202', {}),
      },
      { mode: 'account' },
    );
    expect((await service.fetch(USER, request(), NOW)).status).toBe('OK');
    expect(
      http.calls.filter((c) => c.path === CODEF_PATHS.ACCOUNT_DELETE),
    ).toHaveLength(3);
    expect(pendingCreate).toHaveBeenCalledTimes(1);
    const data = pendingCreate.mock.calls[0][0].data as Record<string, unknown>;
    expect(Object.keys(data).sort()).toEqual(
      [
        'attempts',
        'connectedIdEnc',
        'id',
        'lastErrorCode',
        'lastTriedAt',
        'organization',
      ].sort(),
    );
    expect(data).toMatchObject({
      organization: '0306',
      attempts: 3,
      lastErrorCode: 'CF-12202',
    });
    expect(
      Buffer.from(data.connectedIdEnc as Uint8Array).toString('latin1'),
    ).not.toContain('cid-secret-value');
    expect(JSON.stringify(data)).not.toContain(USER);
  });
});
