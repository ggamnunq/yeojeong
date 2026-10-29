import { Prisma } from '../generated/prisma/client.js';
import type { PrismaService } from '../prisma/prisma.service.js';
import { ER_API_SOURCE_LABEL } from './exchange-rate-api-fx-rate-source.js';
import { exceedsChange, FxJobService } from './fx-job.service.js';
import type { FxPolicyService } from './fx-policy.service.js';
import type { FetchedRate, FxRateSource } from './fx-rate-source.js';

const NOW = new Date('2026-10-29T02:10:00Z');
const AT = new Date('2026-10-29T00:02:31Z');
const DAY = 24 * 60 * 60 * 1000;

interface Prev {
  rate: string;
  source: string;
  effectiveAt: Date;
}

function setup(fetched: FetchedRate[], previous: Record<string, Prev>) {
  const created: { quoteCurrency: string; rate: string; source: string }[] = [];
  const prisma = {
    trip: { findMany: vi.fn(() => Promise.resolve([])) },
    exchangeRate: {
      findFirst: vi.fn(
        (args: {
          where: { quoteCurrency: string; effectiveAt: { lte: Date } };
        }) => {
          const prev = previous[args.where.quoteCurrency];
          return Promise.resolve(
            prev && prev.effectiveAt <= args.where.effectiveAt.lte
              ? { ...prev, rate: new Prisma.Decimal(prev.rate) }
              : null,
          );
        },
      ),
      createMany: vi.fn((args: { data: typeof created }) => {
        created.push(...args.data);
        return Promise.resolve({ count: args.data.length });
      }),
    },
  };
  const source: FxRateSource = {
    id: 'koreaexim+erapi',
    sourceLabel: '한국수출입은행 매매기준율 외',
    fetchLatest: () => Promise.resolve(fetched),
  };
  const job = new FxJobService(
    prisma as unknown as PrismaService,
    { recalculateOngoing: vi.fn() } as unknown as FxPolicyService,
    source,
  );
  return { job, created };
}

const fetchedRate = (
  currency: string,
  ratePerUnit: string,
  source?: string,
): FetchedRate => ({
  currency,
  ratePerUnit,
  displayUnit: 1,
  effectiveAt: AT,
  ...(source && { source }),
});

describe('FxJobService outlier guard', () => {
  it('stores the per-rate source and rejects a rate more than 20% off the previous one', async () => {
    const { job, created } = setup(
      [
        fetchedRate('USD', '1385.5', '한국수출입은행 매매기준율'),
        fetchedRate('TWD', '41.345071', ER_API_SOURCE_LABEL),
        // 직전 0.0519의 10배: 단위 착오 같은 이상값
        fetchedRate('VND', '0.518790', ER_API_SOURCE_LABEL),
        fetchedRate('PHP', '20.942089', ER_API_SOURCE_LABEL), // 직전 고시 없음 → 그대로 저장
      ],
      {
        USD: {
          rate: '1380.5',
          source: '한국수출입은행 매매기준율',
          effectiveAt: new Date(AT.getTime() - DAY),
        },
        TWD: {
          rate: '43.1',
          source: '데모 매매기준율',
          effectiveAt: new Date(AT.getTime() - DAY),
        },
        VND: {
          rate: '0.0519',
          source: ER_API_SOURCE_LABEL,
          effectiveAt: new Date(AT.getTime() - DAY),
        },
      },
    );
    const result = await job.collect(NOW);
    expect(result).toMatchObject({ fetched: 4, inserted: 3, rejected: 1 });
    expect(created.map((r) => [r.quoteCurrency, r.rate, r.source])).toEqual([
      ['USD', '1385.500000', '한국수출입은행 매매기준율'],
      ['TWD', '41.345071', ER_API_SOURCE_LABEL],
      ['PHP', '20.942089', ER_API_SOURCE_LABEL],
    ]);
  });

  it('does not compare against a previous rate older than 14 days', async () => {
    const { job, created } = setup([fetchedRate('TWD', '60')], {
      TWD: {
        rate: '43.1',
        source: '데모 매매기준율',
        effectiveAt: new Date(AT.getTime() - 15 * DAY),
      },
    });
    const result = await job.collect(NOW);
    expect(result).toMatchObject({ inserted: 1, rejected: 0 });
    // 고시에 출처가 없으면 소스의 sourceLabel로 저장한다
    expect(created.map((r) => [r.rate, r.source])).toEqual([
      ['60.000000', '한국수출입은행 매매기준율 외'],
    ]);
  });

  it('skips a rate whose source label does not fit the column', async () => {
    const { job, created } = setup(
      [fetchedRate('USD', '1385.5', 'x'.repeat(41))],
      {},
    );
    const result = await job.collect(NOW);
    expect(result).toMatchObject({ fetched: 1, inserted: 0, rejected: 0 });
    expect(created).toEqual([]);
  });
});

describe('exceedsChange', () => {
  it('flags changes strictly above 20% either way', () => {
    expect(exceedsChange('100.000000', '120.000000')).toBe(false);
    expect(exceedsChange('100.000000', '120.000001')).toBe(true);
    expect(exceedsChange('100.000000', '80.000000')).toBe(false);
    expect(exceedsChange('100.000000', '79.999999')).toBe(true);
    expect(exceedsChange('0.051879', '0.518790')).toBe(true);
    expect(exceedsChange('0.000000', '1.000000')).toBe(false);
  });
});
