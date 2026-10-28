import { createHash, randomBytes, randomInt, randomUUID } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { Test } from '@nestjs/testing';
import { CONSENT_DOCUMENT_VERSIONS } from '../src/common/auth/index.js';
import { parse } from 'dotenv';
import { AppModule } from './../src/app.module.js';
import type {
  ExpenseStatus,
  MemberRole,
  TripStatus,
} from './../src/generated/prisma/client.js';
import { PrismaService } from './../src/prisma/prisma.service.js';
import { APP_OPTIONS, setupApp } from './../src/setup-app.js';

// 실제 DB(로컬 PostgreSQL)에 붙는 e2e(탈퇴·파기·감사 로그)용 픽스처.
// CI에는 DB가 없으므로 DATABASE_URL(.env)이 없으면 describeWithDb가 건너뛴다. 로컬은 `pnpm db:up` 후 실행한다.

export function localDatabaseUrl(): string | undefined {
  if (process.env.DATABASE_URL) return process.env.DATABASE_URL;
  const file = resolve(process.cwd(), '.env');
  if (!existsSync(file)) return undefined;
  return parse(readFileSync(file)).DATABASE_URL || undefined;
}

export function describeWithDb(name: string, fn: () => void): void {
  (localDatabaseUrl() ? describe : describe.skip)(name, () => {
    // 실제 DB에 데이터를 만들고 지우므로, 다른 e2e와 같이 돌 때 기본 5초는 빠듯하다
    vi.setConfig({ testTimeout: 30_000, hookTimeout: 30_000 });
    fn();
  });
}

/**
 * 운영과 같은 가드(쿠키 세션 → sessions 테이블, 동의, 멤버십)와 실제 DB로 앱을 띄운다.
 */
export async function createDbTestApp() {
  const moduleRef = await Test.createTestingModule({
    imports: [AppModule],
  }).compile();
  const app =
    moduleRef.createNestApplication<NestExpressApplication>(APP_OPTIONS);
  setupApp(app);
  await app.init();
  return { app, db: app.get(PrismaService) };
}

type Db = PrismaService;

const DAY = 86_400_000;
export const daysAgo = (days: number, from = Date.now()) =>
  new Date(from - days * DAY);
export const yearsAgo = (years: number, plusDays = 0) => {
  const d = new Date();
  d.setUTCFullYear(d.getUTCFullYear() - years);
  return new Date(d.getTime() - plusDays * DAY);
};

const INVITE_CHARS = '23456789ABCDEFGHJKMNPQRSTUVWXYZ';
const inviteCode = () =>
  Array.from(
    { length: 6 },
    () => INVITE_CHARS[randomInt(INVITE_CHARS.length)],
  ).join('');
const hex64 = () => randomBytes(32).toString('hex');

export async function createUser(
  db: Db,
  input: { nickname?: string; lastLoginAt?: Date } = {},
) {
  return db.user.create({
    data: {
      kakaoId: String(randomInt(1e9, 9e9)) + String(randomInt(1e5, 9e5)),
      nickname: input.nickname ?? '테스트',
      profileImageUrl: 'https://k.kakaocdn.net/dn/test/profile.jpg',
      lastLoginAt: input.lastLoginAt ?? new Date(),
    },
  });
}

/** DB에 세션 행을 만들고 쿠키에 넣을 원문 토큰을 돌려준다 */
export async function createSession(
  db: Db,
  userId: string,
  input: { expiresAt?: Date; revokedAt?: Date } = {},
) {
  const token = randomBytes(32).toString('base64url');
  const session = await db.session.create({
    data: {
      userId,
      tokenHash: createHash('sha256').update(token).digest('hex'),
      expiresAt: input.expiresAt ?? new Date(Date.now() + 30 * DAY),
      revokedAt: input.revokedAt,
    },
  });
  return { token, session };
}

/** 가입 동의 3건(TOS·PRIVACY·AGE14) + 마케팅 미동의 1건. userRefHash는 auth 모듈이 만든 값 흉내 */
export async function createSignupConsents(db: Db, userId: string) {
  const userRefHash = hex64();
  const ids = ['TOS', 'PRIVACY', 'AGE14', 'MARKETING'] as const;
  for (const consentId of ids) {
    const doc = CONSENT_DOCUMENT_VERSIONS.find(
      (d) => d.consentId === consentId,
    );
    await db.userConsent.create({
      data: {
        userId,
        userRefHash,
        consentId,
        version: doc?.version ?? '0.1-draft',
        agreed: consentId !== 'MARKETING',
        ip: '203.0.113.7',
        ua: 'yeojeong-e2e',
        screen: 'WF-04',
        method: 'ALL',
        docHash: doc?.docHash ?? hex64(),
      },
    });
  }
  return userRefHash;
}

export interface MemberInput {
  userId: string;
  role?: MemberRole;
  leftAt?: Date;
}

/** 그룹 1 : 여정 1 + 멤버십(배열 순서 = joinOrder) */
export async function createGroupWithTrip(
  db: Db,
  input: {
    name?: string;
    status: TripStatus;
    members: MemberInput[];
    deletedAt?: Date;
    endedAt?: Date;
    autoEndAt?: Date;
  },
) {
  const autoEndAt = input.autoEndAt ?? new Date(Date.now() + 3 * DAY);
  const startAt = new Date(autoEndAt.getTime() - 4 * DAY);
  const group = await db.group.create({
    data: {
      name: input.name ?? '오사카',
      inviteCode: inviteCode(),
      createdByUserId: input.members[0]?.userId,
      deletedAt: input.deletedAt,
    },
  });
  const ended = input.status === 'ENDED';
  const trip = await db.trip.create({
    data: {
      groupId: group.id,
      placeLabel: '일본 오사카',
      countryCode: 'JP',
      currency: 'JPY',
      startDate: startAt,
      endDate: autoEndAt,
      startAt,
      autoEndAt,
      budgetKrw: 1_200_000,
      status: input.status,
      endedAt: ended ? (input.endedAt ?? autoEndAt) : null,
      endReason: ended ? 'AUTO' : null,
      deletedAt: input.deletedAt,
    },
  });
  const memberships = [];
  for (const [index, member] of input.members.entries()) {
    memberships.push(
      await db.membership.create({
        data: {
          groupId: group.id,
          userId: member.userId,
          role: member.role ?? (index === 0 ? 'LEADER' : 'MEMBER'),
          joinOrder: index + 1,
          leftAt: member.leftAt,
          leaveReason: member.leftAt ? 'LEFT' : null,
        },
      }),
    );
  }
  return { group, trip, memberships };
}

export async function createExpense(
  db: Db,
  input: {
    tripId: string;
    payerMembershipId: string;
    status: ExpenseStatus;
    krw: number;
    merchantName?: string;
    shareMembershipIds?: string[];
    transactionId?: string;
  },
) {
  const expense = await db.expense.create({
    data: {
      tripId: input.tripId,
      payerMembershipId: input.payerMembershipId,
      status: input.status,
      occurredAt: new Date(),
      merchantName: input.merchantName ?? '이치란 라멘',
      originalAmount: String(input.krw),
      originalCurrency: 'KRW',
      krwAmount: input.krw,
      netKrwAmount: input.krw,
      transactionId: input.transactionId,
    },
  });
  const shares = input.shareMembershipIds ?? [];
  for (const [index, membershipId] of shares.entries()) {
    const base = Math.floor(input.krw / shares.length);
    const rest = input.krw - base * shares.length;
    await db.expenseShare.create({
      data: {
        expenseId: expense.id,
        membershipId,
        amountKrw: index === 0 ? base + rest : base,
        isRemainderHolder: index === 0 && rest > 0,
      },
    });
  }
  return expense;
}

/** 토스(DEMO) 연결 + 카드 1장 + 거래 1건 + 연결 시도 1건 */
export async function createPaymentSetup(
  db: Db,
  userId: string,
  input: { importedAt?: Date } = {},
) {
  const connection = await db.paymentConnection.create({
    data: {
      userId,
      provider: 'DEMO',
      accessTokenEnc: randomBytes(48),
      refreshTokenEnc: randomBytes(48),
      connectedAt: new Date(),
    },
  });
  const method = await db.paymentMethod.create({
    data: {
      userId,
      connectionId: connection.id,
      type: 'CARD',
      institutionName: '신한카드',
      productName: '신한카드 Deep Dream',
      shortLabel: '신한카드',
      maskedNumber: '5365-****-****-1934',
      last4: '1934',
      externalRef: randomUUID(),
    },
  });
  const transaction = await createTransaction(db, userId, method.id, input);
  const attempt = await db.connectionAttempt.create({
    data: {
      userId,
      purpose: 'WALLET_ADD',
      stateHash: hex64(),
      expiresAt: new Date(Date.now() + 10 * 60_000),
    },
  });
  return { connection, method, transaction, attempt };
}

export async function createTransaction(
  db: Db,
  userId: string,
  paymentMethodId: string,
  input: { importedAt?: Date; sameUserDuplicateOfId?: string } = {},
) {
  return db.transaction.create({
    data: {
      userId,
      paymentMethodId,
      externalRef: randomUUID(),
      kind: 'APPROVAL',
      occurredAt: new Date(),
      merchantNameRaw: '이치란 라멘 도톤보리',
      merchantKey: '이치란라멘도톤보리',
      originalAmount: '3960',
      originalCurrency: 'JPY',
      rawPayloadEnc: randomBytes(64),
      importedAt: input.importedAt,
      sameUserDuplicateOfId: input.sameUserDuplicateOfId,
    },
  });
}

/** 테스트가 만든 회원과 결제 데이터를 지운다(그룹은 removeGroups로 먼저) */
export async function removeUsers(db: Db, userIds: string[]) {
  if (userIds.length === 0) return;
  const where = { userId: { in: userIds } };
  await db.transaction.deleteMany({ where });
  await db.paymentMethod.deleteMany({ where });
  await db.connectionAttempt.deleteMany({ where });
  await db.paymentConnection.deleteMany({ where });
  await db.user.deleteMany({ where: { id: { in: userIds } } });
}

/** 테스트가 만든 그룹을 기록째 지운다(FK 순서) */
export async function removeGroups(db: Db, groupIds: string[]) {
  if (groupIds.length === 0) return;
  const trips = await db.trip.findMany({
    where: { groupId: { in: groupIds } },
    select: { id: true },
  });
  const tripIds = trips.map((t) => t.id);
  await db.expenseChangeLog.deleteMany({ where: { tripId: { in: tripIds } } });
  await db.expense.deleteMany({ where: { tripId: { in: tripIds } } });
  await db.settlement.deleteMany({ where: { tripId: { in: tripIds } } });
  await db.tripEvent.deleteMany({ where: { tripId: { in: tripIds } } });
  await db.trip.deleteMany({ where: { id: { in: tripIds } } });
  await db.membership.deleteMany({ where: { groupId: { in: groupIds } } });
  await db.group.deleteMany({ where: { id: { in: groupIds } } });
}
