import { createHash } from 'node:crypto';
import { ProviderError } from '../payment-methods/providers/payment-provider.adapter.js';
import {
  OUT_OF_PERIOD_CANDIDATE_TTL_MS,
  OutOfPeriodLookupService,
} from './out-of-period-lookup.service.js';

const NOW = new Date('2026-11-11T00:00:00.000Z');
const RANGE = {
  fromAt: new Date('2026-10-01T00:00:00.000Z'),
  toAt: new Date('2026-11-11T23:59:59.999Z'),
};

function fixture() {
  const method = {
    id: '11111111-1111-4111-8111-111111111111',
    type: 'CARD',
    status: 'ACTIVE',
    externalRef: 'card-ref',
    linkedAccountRef: null,
    shortLabel: '토스뱅크 체크카드',
    last4: '1934',
    connection: {
      id: '22222222-2222-4222-8222-222222222222',
      status: 'ACTIVE',
      accessTokenEnc: new Uint8Array([1]),
      refreshTokenEnc: new Uint8Array([2]),
      tokenExpiresAt: null,
    },
  };
  const approval = {
    ref: 'approval-1',
    kind: 'APPROVAL' as const,
    occurredAt: new Date('2026-10-20T12:10:00.000Z'),
    merchantName: '아고다',
    amount: '486000',
    currency: 'KRW',
    krwAmount: 486000,
    raw: { private: true },
  };
  const transactionFindMany = vi.fn().mockResolvedValue([]);
  const prisma = {
    paymentMethod: { findMany: vi.fn().mockResolvedValue([method]) },
    paymentConnection: { update: vi.fn() },
    transaction: {
      findMany: transactionFindMany,
      create: vi.fn(),
      createMany: vi.fn(),
      update: vi.fn(),
    },
  };
  const adapter = {
    listTransactions: vi.fn().mockResolvedValue({ items: [approval] }),
    refreshTokens: vi.fn(),
  };
  const cipher = {
    decrypt: vi.fn((value: Uint8Array) =>
      value[0] === 1 ? 'access-token' : 'refresh-token',
    ),
    encrypt: vi.fn(() => new Uint8Array([3])),
    hmacRef: vi.fn((value: string) =>
      createHash('sha256').update(value).digest('hex'),
    ),
  };
  const sync = { expire: vi.fn() };
  const service = new OutOfPeriodLookupService(
    prisma as never,
    adapter as never,
    cipher as never,
    sync as never,
  );
  return { service, prisma, adapter, sync };
}

describe('OutOfPeriodLookupService', () => {
  it('returns a signed live candidate without storing provider transaction data', async () => {
    const { service, prisma, adapter } = fixture();

    const candidates = await service.list('user-1', 'trip-1', RANGE, NOW);

    expect(candidates).toHaveLength(1);
    expect(candidates[0]).toMatchObject({
      merchantName: '아고다',
      originalAmount: '486000.0000',
      originalCurrency: 'KRW',
      providerKrwAmount: 486000,
      paymentMethodLabel: '토스뱅크 체크카드 1934',
    });
    expect(candidates[0].candidateId).toMatch(/^[^.]+\.[0-9a-f]{64}$/);
    expect(adapter.listTransactions).toHaveBeenCalledOnce();
    expect(prisma.transaction.create).not.toHaveBeenCalled();
    expect(prisma.transaction.createMany).not.toHaveBeenCalled();
    expect(prisma.transaction.update).not.toHaveBeenCalled();
  });

  it('rechecks a valid selection at the provider and returns data without DB writes', async () => {
    const { service, prisma, adapter } = fixture();
    const [candidate] = await service.list('user-1', 'trip-1', RANGE, NOW);

    const confirmed = await service.confirm(
      'user-1',
      'trip-1',
      [candidate.candidateId],
      [RANGE],
      new Date(NOW.getTime() + 1000),
    );

    expect(adapter.listTransactions).toHaveBeenCalledTimes(2);
    expect(confirmed.selected).toEqual([
      {
        candidateId: candidate.candidateId,
        paymentMethodId: '11111111-1111-4111-8111-111111111111',
        externalRef: 'approval-1',
      },
    ]);
    expect(confirmed.batches[0].items[0]).toMatchObject({ ref: 'approval-1' });
    expect(prisma.transaction.createMany).not.toHaveBeenCalled();
  });

  it('rejects an expired candidate before storing anything', async () => {
    const { service, prisma, adapter } = fixture();
    const [candidate] = await service.list('user-1', 'trip-1', RANGE, NOW);

    await expect(
      service.confirm(
        'user-1',
        'trip-1',
        [candidate.candidateId],
        [RANGE],
        new Date(NOW.getTime() + OUT_OF_PERIOD_CANDIDATE_TTL_MS + 1),
      ),
    ).rejects.toMatchObject({
      code: 'OUT_OF_PERIOD_CANDIDATE_INVALID',
      details: { invalidCandidateIds: [candidate.candidateId] },
    });
    expect(adapter.listTransactions).toHaveBeenCalledOnce();
    expect(prisma.transaction.createMany).not.toHaveBeenCalled();
  });

  it('expires the connection when provider authentication cannot be refreshed', async () => {
    const { service, adapter, sync } = fixture();
    adapter.listTransactions.mockRejectedValueOnce(
      new ProviderError('AUTH_EXPIRED'),
    );
    adapter.refreshTokens.mockRejectedValueOnce(
      new ProviderError('AUTH_EXPIRED'),
    );

    await expect(
      service.list('user-1', 'trip-1', RANGE, NOW),
    ).rejects.toMatchObject({ code: 'CONNECTION_EXPIRED' });
    expect(sync.expire).toHaveBeenCalledWith(
      '22222222-2222-4222-8222-222222222222',
      'AUTH_EXPIRED',
    );
  });
});
