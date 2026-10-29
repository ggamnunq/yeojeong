import type { ConfigService } from '@nestjs/config';
import type { FileImportItem, FieldError } from '@yeojeong/shared';
import type { AuditService } from '../audit/index.js';
import { ImportKeyHasher } from '../card-import/import-key.js';
import { ValidationFailedError } from '../common/errors/index.js';
import type { PrismaService } from '../prisma/prisma.service.js';
import type { WalletService } from '../wallet/wallet.service.js';
import {
  fileImportKeyMaterial,
  FileImportService,
} from './file-import.service.js';

// 서비스 단위: importKey(사용자·공급자 범위 HMAC), 입력 검사(S7 규칙 재사용), 이미 있는 거래 건너뛰기, 접근 기록은 건수만.
// 시각은 고정 now를 넘긴다(시계 의존 없음).

const NOW = new Date('2026-10-30T03:00:00Z');
const ME = '11111111-1111-4111-8111-111111111111';
const OTHER = '22222222-2222-4222-8222-222222222222';
const DIGEST_A = 'a'.repeat(64);
const DIGEST_B = 'b'.repeat(64);

const hasher = new ImportKeyHasher({
  get: (name: string) =>
    name === 'IMPORT_KEY_HMAC_KEY' ? 'k'.repeat(64) : undefined,
} as unknown as ConfigService);

const item = (over: Partial<FileImportItem> = {}): FileImportItem => ({
  txnDigest: DIGEST_A,
  occurredAt: '2026-10-28T12:34:56+08:00',
  amount: '128.00',
  currency: 'CNY',
  merchantName: '瑞幸咖啡',
  ...over,
});

function setup(existing: Set<string> = new Set()) {
  const saved: { importKey: string; occurredAt: Date; merchantName: string }[] =
    [];
  const wallet = {
    saveFileImported: vi.fn(
      (
        _userId: string,
        input: { importKey: string; occurredAt: Date; merchantName: string },
      ) => {
        saved.push(input);
        const created = !existing.has(input.importKey);
        existing.add(input.importKey);
        return Promise.resolve({
          entryId: `entry-${saved.length}`,
          created,
          linked: created,
        });
      },
    ),
    suggestedTripIds: vi.fn((_userId: string, times: readonly Date[]) =>
      Promise.resolve(
        times.map((t) => (t.getUTCDate() === 28 ? 'trip-1' : null)),
      ),
    ),
  };
  const prisma = {
    transaction: {
      findMany: vi.fn(
        ({ where }: { where: { externalRef: { in: string[] } } }) =>
          Promise.resolve(
            where.externalRef.in
              .filter((k) => existing.has(k))
              .map((externalRef) => ({ externalRef })),
          ),
      ),
    },
  };
  const audit = { record: vi.fn(() => Promise.resolve()) };
  const service = new FileImportService(
    prisma as unknown as PrismaService,
    wallet as unknown as WalletService,
    hasher,
    audit as unknown as AuditService,
  );
  return { service, wallet, prisma, audit, saved };
}

const fieldErrors = async (
  promise: Promise<unknown>,
): Promise<FieldError[]> => {
  const error = await promise.catch((e: unknown) => e);
  expect(error).toBeInstanceOf(ValidationFailedError);
  return ((error as ValidationFailedError).details as { fields: FieldError[] })
    .fields;
};

describe('FileImportService (W10)', () => {
  it('derives importKey as HMAC over provider + user + digest (deterministic, user-scoped, never the digest itself)', () => {
    const { service } = setup();
    const key = service.importKeyOf('WECHAT', ME, DIGEST_A);
    expect(key).toMatch(/^[0-9a-f]{64}$/);
    expect(key).toBe(service.importKeyOf('WECHAT', ME, DIGEST_A));
    expect(key).not.toBe(DIGEST_A);
    expect(key).not.toBe(service.importKeyOf('WECHAT', OTHER, DIGEST_A));
    expect(key).not.toBe(service.importKeyOf('WECHAT', ME, DIGEST_B));
    expect(key).toBe(hasher.hash(`file-import:v1|WECHAT|${ME}|${DIGEST_A}`));
    expect(fileImportKeyMaterial('WECHAT', ME, DIGEST_A)).toBe(
      `file-import:v1|WECHAT|${ME}|${DIGEST_A}`,
    );
  });

  it('saves each item with the hashed key, skips already-saved ones and records counts only', async () => {
    const { service, saved, audit } = setup();
    const first = await service.import(
      ME,
      { provider: 'WECHAT', items: [item(), item({ txnDigest: DIGEST_B })] },
      NOW,
    );
    expect(first).toEqual({
      items: [
        { created: true, entryId: 'entry-1' },
        { created: true, entryId: 'entry-2' },
      ],
      created: 2,
      skipped: 0,
      linked: 2,
    });
    expect(saved[0]).toMatchObject({
      importKey: service.importKeyOf('WECHAT', ME, DIGEST_A),
      merchantName: '瑞幸咖啡',
    });
    // +08:00 시각은 그 순간 그대로(KST로는 한 시간 뒤 13:34:56)
    expect(saved[0].occurredAt.toISOString()).toBe('2026-10-28T04:34:56.000Z');
    expect(JSON.stringify(saved)).not.toContain(DIGEST_A);

    const again = await service.import(
      ME,
      { provider: 'WECHAT', items: [item()] },
      NOW,
    );
    expect(again).toMatchObject({ created: 0, skipped: 1, linked: 0 });

    const details = audit.record.mock.calls.map(
      (c) => (c as unknown as [{ action: string; details: object }])[0],
    );
    expect(details[0]).toMatchObject({
      action: 'IMPORT_FILE_ENTRIES',
      details: { provider: 'WECHAT', requested: 2, created: 2, linked: 2 },
    });
    expect(JSON.stringify(details)).not.toMatch(/128|瑞幸|aaaa/);
  });

  it('rejects the whole request with S7 rules before saving anything', async () => {
    const { service, wallet } = setup();
    const errors = await fieldErrors(
      service.import(
        ME,
        {
          provider: 'WECHAT',
          items: [
            item({ amount: '1.234' }),
            item({ txnDigest: DIGEST_B, merchantName: '가'.repeat(41) }),
            item({
              txnDigest: 'c'.repeat(64),
              occurredAt: '2026-11-30T00:00:00+08:00',
            }),
            item({
              txnDigest: 'd'.repeat(64),
              occurredAt: '2024-01-01T00:00:00+08:00',
            }),
            item({
              txnDigest: 'e'.repeat(64),
              currency: 'KRW',
              amount: '1000',
            }),
            item(),
          ],
        },
        NOW,
      ),
    );
    const paths = errors.map((e) => `${e.path}:${e.code}`);
    expect(paths).toEqual([
      'items.0.amount:fractionDigits',
      'items.1.merchantName:maxLength',
      'items.2.occurredAt:future',
      expect.stringMatching(/^items\.3\.occurredAt:/),
      'items.4.currency:isIn',
      'items.5.txnDigest:duplicate',
    ]);
    // 오류에 값(다이제스트·가맹점)을 되돌려 주지 않는다
    expect(JSON.stringify(errors)).not.toContain(DIGEST_A);
    expect(JSON.stringify(errors)).not.toContain('가'.repeat(41));
    expect(wallet.saveFileImported).not.toHaveBeenCalled();
  });

  it('check: marks already-saved digests and previews the auto-linked trip in request order', async () => {
    const { service, prisma } = setup(
      new Set([hasher.hash(fileImportKeyMaterial('WECHAT', ME, DIGEST_B))]),
    );
    const res = await service.check(ME, {
      provider: 'WECHAT',
      items: [
        { txnDigest: DIGEST_A, occurredAt: '2026-10-28T12:00:00+08:00' },
        { txnDigest: DIGEST_B, occurredAt: '2026-10-20T12:00:00+08:00' },
      ],
    });
    expect(res).toEqual({
      items: [
        { imported: false, inTripId: 'trip-1' },
        { imported: true, inTripId: null },
      ],
    });
    // DB에는 HMAC만 묻는다(다이제스트 원문 아님)
    expect(
      JSON.stringify(prisma.transaction.findMany.mock.calls),
    ).not.toContain(DIGEST_A);
    // 다른 사용자에게는 "추가됨"이 아니다
    const other = await service.check(OTHER, {
      provider: 'WECHAT',
      items: [{ txnDigest: DIGEST_B, occurredAt: '2026-10-20T12:00:00+08:00' }],
    });
    expect(other.items[0].imported).toBe(false);
  });
});
