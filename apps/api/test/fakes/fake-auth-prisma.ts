import { randomUUID } from 'node:crypto';

// auth·users·consents e2e용 메모리 DB. 이 모듈들이 쓰는 Prisma 호출만 흉내 낸다(select는 무시하고 행 전체를 돌려준다).
// 다른 모듈은 실제 로컬 DB(createTestApp의 prisma: 'real')나 자기 가짜를 쓴다.

type Row = Record<string, unknown> & { id: string };

function matches(
  row: Record<string, unknown>,
  where: Record<string, unknown> = {},
) {
  return Object.entries(where).every(([key, condition]) => {
    const value = row[key];
    if (
      condition !== null &&
      typeof condition === 'object' &&
      !(condition instanceof Date)
    ) {
      const c = condition as Record<string, unknown>;
      if ('in' in c) return (c.in as unknown[]).includes(value);
      if ('gt' in c) return value instanceof Date && value > (c.gt as Date);
      if ('not' in c) return value !== c.not;
    }
    return value === condition;
  });
}

/** 유니크 키. where가 있으면 부분 유니크(그 조건을 만족하는 행끼리만 비교) */
type UniqueKey = string[] | { keys: string[]; where: (row: Row) => boolean };

class Table {
  readonly rows: Row[] = [];

  constructor(
    private readonly defaults: () => Record<string, unknown> = () => ({}),
    private readonly unique: UniqueKey[] = [],
  ) {}

  private assertUnique(row: Row) {
    for (const key of this.unique) {
      const keys = Array.isArray(key) ? key : key.keys;
      const where = Array.isArray(key) ? () => true : key.where;
      if (keys.some((k) => row[k] === null || row[k] === undefined)) continue;
      if (!where(row)) continue;
      if (
        this.rows.some(
          (r) => r !== row && where(r) && keys.every((k) => r[k] === row[k]),
        )
      ) {
        throw Object.assign(new Error('Unique constraint failed'), {
          code: 'P2002',
        });
      }
    }
  }

  insert(data: Record<string, unknown>): Row {
    const row = {
      id: randomUUID(),
      createdAt: new Date(),
      updatedAt: new Date(),
      ...this.defaults(),
      ...data,
    } as Row;
    this.assertUnique(row);
    this.rows.push(row);
    return row;
  }

  findUnique = ({ where }: { where: Record<string, unknown> }) =>
    Promise.resolve(this.rows.find((r) => matches(r, where)) ?? null);
  findFirst = ({ where }: { where?: Record<string, unknown> }) =>
    Promise.resolve(this.rows.find((r) => matches(r, where)) ?? null);
  findMany = ({ where }: { where?: Record<string, unknown> } = {}) =>
    Promise.resolve(this.rows.filter((r) => matches(r, where)));
  count = ({ where }: { where?: Record<string, unknown> } = {}) =>
    Promise.resolve(this.rows.filter((r) => matches(r, where)).length);
  create = ({ data }: { data: Record<string, unknown> }) =>
    Promise.resolve(this.insert(data));
  createMany = ({
    data,
    skipDuplicates,
  }: {
    data: Record<string, unknown>[];
    skipDuplicates?: boolean;
  }) => {
    let count = 0;
    for (const item of data) {
      try {
        this.insert(item);
        count++;
      } catch (error) {
        if (!skipDuplicates) throw error;
      }
    }
    return Promise.resolve({ count });
  };
  update = ({
    where,
    data,
  }: {
    where: Record<string, unknown>;
    data: Record<string, unknown>;
  }) => {
    const row = this.rows.find((r) => matches(r, where));
    if (!row)
      throw Object.assign(new Error('Record not found'), { code: 'P2025' });
    Object.assign(row, data, { updatedAt: new Date() });
    return Promise.resolve(row);
  };
  updateMany = ({
    where,
    data,
  }: {
    where: Record<string, unknown>;
    data: Record<string, unknown>;
  }) => {
    const rows = this.rows.filter((r) => matches(r, where));
    rows.forEach((row) => Object.assign(row, data, { updatedAt: new Date() }));
    return Promise.resolve({ count: rows.length });
  };
  delete = ({ where }: { where: Record<string, unknown> }) => {
    const index = this.rows.findIndex((r) => matches(r, where));
    if (index < 0)
      throw Object.assign(new Error('Record not found'), { code: 'P2025' });
    return Promise.resolve(this.rows.splice(index, 1)[0]);
  };
  deleteMany = ({ where }: { where?: Record<string, unknown> } = {}) => {
    const before = this.rows.length;
    for (let i = this.rows.length - 1; i >= 0; i--) {
      if (matches(this.rows[i], where)) this.rows.splice(i, 1);
    }
    return Promise.resolve({ count: before - this.rows.length });
  };
}

export const DRAFT_DOCUMENTS = [
  'TOS',
  'PRIVACY',
  'AGE14',
  'MARKETING',
  'FIN_LINK',
  'FIN_PRIVACY',
  'THIRD_PARTY',
].map((consentId) => ({
  consentId,
  version: '0.1-draft',
  title: consentId,
  required: consentId !== 'MARKETING',
  docPath: `docs/legal/${consentId}.md`,
  docHash: 'a'.repeat(64),
  effectiveAt: new Date('2026-10-28T00:00:00+09:00'),
  changeType: 'MAJOR',
  summary: null,
  isDraft: true,
}));

export function createFakeAuthPrisma() {
  const user = new Table(
    () => ({
      profileImageUrl: null,
      profileImageSyncedAt: null,
      marketingOptIn: false,
      lastLoginAt: new Date(),
    }),
    [['kakaoId']],
  );
  const session = new Table(
    () => ({ lastSeenAt: new Date(), revokedAt: null }),
    [['tokenHash']],
  );
  const sessionApi = {
    ...pick(session),
    // include: { user } 흉내
    findUnique: async (args: { where: Record<string, unknown> }) => {
      const row = await session.findUnique(args);
      return row
        ? { ...row, user: user.rows.find((u) => u.id === row.userId) }
        : null;
    },
  };
  const db = {
    user: pick(user),
    signupTicket: pick(new Table(() => ({}), [['kakaoId']])),
    session: sessionApi,
    userConsent: pick(
      new Table(
        () => ({
          agreedAt: new Date(),
          withdrawnAt: null,
          withdrawChannel: null,
        }),
        // 마이그레이션 20261029010000의 부분 유니크 user_consents_active_key
        [
          {
            keys: ['userId', 'consentId', 'version'],
            where: (row) => row.agreed === true && row.withdrawnAt === null,
          },
        ],
      ),
    ),
    consentDocument: pick(new Table(() => ({}), [['consentId', 'version']])),
    accountDeletion: pick(
      new Table(() => ({ requestedAt: new Date(), completedAt: null })),
    ),
    paymentMethod: pick(new Table()),
    paymentConnection: pick(new Table()),
    // Me.walletEntryCount(S7b)
    transaction: pick(new Table()),
    membership: pick(new Table()),
    $queryRaw: () => Promise.resolve([]),
    $transaction: <T>(fn: (tx: unknown) => Promise<T>) => fn(db),
    tables: { user, session },
  };
  void db.consentDocument.createMany({ data: DRAFT_DOCUMENTS });
  return db;
}

function pick(table: Table) {
  return {
    findUnique: table.findUnique,
    findFirst: table.findFirst,
    findMany: table.findMany,
    count: table.count,
    create: table.create,
    createMany: table.createMany,
    update: table.update,
    updateMany: table.updateMany,
    delete: table.delete,
    deleteMany: table.deleteMany,
    rows: table.rows,
  };
}

export type FakeAuthPrisma = ReturnType<typeof createFakeAuthPrisma>;
