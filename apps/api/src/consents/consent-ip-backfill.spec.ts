import { createHmac } from 'node:crypto';
import { Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { AuditService } from '../audit/audit.service.js';
import type { PrismaService } from '../prisma/prisma.service.js';
import {
  CONSENT_IP_BATCH,
  ConsentIpBackfillService,
  hashConsentIpBatch,
} from './consent-ip-backfill.js';

const KEY = 'k'.repeat(32);
const hmac = (ip: string) => createHmac('sha256', KEY).update(ip).digest('hex');
const row = (n: number) => ({
  id: `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`,
  ip: `10.0.0.${n % 250}`,
});

/** $queryRaw는 남은 평문 행을, $executeRaw는 바꾼 행 수를 돌려주는 가짜 트랜잭션 */
function fakeDb(pending: { id: string; ip: string }[]) {
  const rows = [...pending];
  const updates: { ids: string[]; hashes: string[] }[] = [];
  const tx = {
    $queryRaw: vi.fn((_: TemplateStringsArray, limit: number) =>
      Promise.resolve(rows.slice(0, limit)),
    ),
    $executeRaw: vi.fn(
      (_: TemplateStringsArray, ids: string[], hashes: string[]) => {
        updates.push({ ids, hashes });
        for (const id of ids) {
          const i = rows.findIndex((r) => r.id === id);
          if (i >= 0) rows.splice(i, 1);
        }
        return Promise.resolve(ids.length);
      },
    ),
    userConsent: { count: vi.fn(() => Promise.resolve(rows.length)) },
  };
  const prisma = {
    ...tx,
    $transaction: vi.fn((work: (t: typeof tx) => Promise<unknown>) => work(tx)),
  };
  return { tx, prisma, rows, updates };
}

const audit = (env: Record<string, string>) =>
  new AuditService({} as PrismaService, new ConfigService(env));

describe('hashConsentIpBatch', () => {
  it('hashes up to the limit, reports the rest, and never sends plaintext to the update', async () => {
    const { tx, updates } = fakeDb([row(1), row(2), row(3)]);
    const out = await hashConsentIpBatch(tx as never, (ip) => hmac(ip), 2);
    expect(out).toEqual({ count: 2, hasMore: true });
    expect(updates).toEqual([
      {
        ids: [row(1).id, row(2).id],
        hashes: [hmac(row(1).ip), hmac(row(2).ip)],
      },
    ]);
  });

  it('does nothing when no plaintext is left', async () => {
    const { tx } = fakeDb([]);
    expect(await hashConsentIpBatch(tx as never, hmac, 10)).toEqual({
      count: 0,
      hasMore: false,
    });
    expect(tx.$executeRaw).not.toHaveBeenCalled();
  });

  it('refuses to clear plaintext it cannot hash', async () => {
    const { tx } = fakeDb([row(1)]);
    await expect(
      hashConsentIpBatch(tx as never, () => null, 10),
    ).rejects.toThrow(/AUDIT_HMAC_KEY/);
    expect(tx.$executeRaw).not.toHaveBeenCalled();
  });
});

describe('ConsentIpBackfillService', () => {
  beforeAll(() => Logger.overrideLogger(false));
  // 테스트 기본 env(test/env.ts)의 키가 ConfigService보다 먼저 읽히지 않게 지운다
  beforeEach(() => vi.stubEnv('AUDIT_HMAC_KEY', undefined));
  afterEach(() => vi.unstubAllEnvs());

  it('runs batches until no plaintext is left', async () => {
    const pending = Array.from({ length: CONSENT_IP_BATCH * 2 + 1 }, (_, i) =>
      row(i),
    );
    const { prisma, updates } = fakeDb(pending);
    const service = new ConsentIpBackfillService(
      prisma as unknown as PrismaService,
      audit({ AUDIT_HMAC_KEY: KEY }),
    );
    expect(await service.run()).toEqual({
      hashed: CONSENT_IP_BATCH * 2 + 1,
      remaining: 0,
    });
    expect(updates).toHaveLength(3);
  });

  it('skips without touching plaintext when no key is configured', async () => {
    const { prisma } = fakeDb([row(1)]);
    const service = new ConsentIpBackfillService(
      prisma as unknown as PrismaService,
      audit({}),
    );
    expect(await service.run()).toEqual({
      hashed: 0,
      remaining: 1,
      skipped: 'NO_KEY',
    });
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });
});
