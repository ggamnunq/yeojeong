import { randomBytes, randomUUID } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import { connect } from 'node:net';
import { fileURLToPath } from 'node:url';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { Test } from '@nestjs/testing';
import { PrismaPg } from '@prisma/adapter-pg';
import {
  splitEvenly,
  type ExpenseStatus,
  type TripStatus,
} from '@yeojeong/shared';
import { parse } from 'dotenv';
import { AppModule } from './../src/app.module.js';
import {
  ConsentChecker,
  MembershipLookup,
  SessionResolver,
} from './../src/common/auth/index.js';
import { PrismaMembershipLookup } from './../src/common/auth/membership-lookup.js';
import { FeatureFlags } from './../src/common/features.js';
import { merchantKeyOf } from './../src/expenses/duplicates.js';
import { Prisma, PrismaClient } from './../src/generated/prisma/client.js';
import type { PrismaService } from './../src/prisma/prisma.service.js';
import { APP_OPTIONS, setupApp } from './../src/setup-app.js';
import { createTestAuth } from './auth-helpers.js';

// 실제 DB(로컬 docker, DATABASE_URL)에 붙는 결제 e2e용 데이터. 테스트가 만든 행만 지운다(다른 세션과 DB를 같이 쓴다).

/** DATABASE_URL(env 또는 apps/api/.env)이 있고 접속되면 그 값, 아니면 null → e2e를 건너뛴다(CI에는 DB가 없다) */
export async function reachableDatabaseUrl(): Promise<string | null> {
  let url = process.env.DATABASE_URL;
  const envFile = fileURLToPath(new URL('../.env', import.meta.url));
  if (!url && existsSync(envFile)) {
    url = parse(readFileSync(envFile)).DATABASE_URL;
  }
  if (!url) return null;
  const { hostname, port } = new URL(url);
  const ok = await new Promise<boolean>((done) => {
    const socket = connect({ host: hostname, port: Number(port || 5432) });
    const finish = (value: boolean) => {
      socket.destroy();
      done(value);
    };
    socket.setTimeout(1000, () => finish(false));
    socket.once('connect', () => finish(true));
    socket.once('error', () => finish(false));
  });
  if (!ok) return null;
  process.env.DATABASE_URL = url;
  return url;
}

export function createFixturePrisma(url: string) {
  return new PrismaClient({ adapter: new PrismaPg({ connectionString: url }) });
}

/** "2026-11-13 14:10" (KST) → Date */
export const kst = (value: string) =>
  new Date(`${value.replace(' ', 'T')}:00+09:00`);

const INVITE_CHARS = '23456789ABCDEFGHJKMNPQRSTUVWXYZ';
const inviteCode = () =>
  Array.from(randomBytes(6), (b) => INVITE_CHARS[b % INVITE_CHARS.length]).join(
    '',
  );

export interface SeedMember {
  userId: string;
  membershipId: string;
  /** withPaymentMethod: false로 만든 사용자는 '' */
  paymentMethodId: string;
  nickname: string;
}

export interface SeedTrip {
  tripId: string;
  groupId: string;
  members: Record<string, SeedMember>;
}

/**
 * 실제 DB + 전역 가드 체인. 멤버십 조회는 실제 구현(PrismaMembershipLookup)을 쓴다.
 * features를 주면 기능 플래그(FeatureFlags)를 그 값으로 바꿔 끼운다(기본은 env)
 */
export async function createDbTestApp(
  prisma: PrismaClient,
  options: { features?: { accountLink: boolean } } = {},
) {
  const memberships: MembershipLookup = new PrismaMembershipLookup(
    prisma as unknown as PrismaService,
  );
  const auth = { ...createTestAuth(), memberships };
  let builder = Test.createTestingModule({
    // EventEmitterModule.forRoot()는 AppModule에 있다(중복 등록하지 않는다)
    imports: [AppModule],
  });
  if (options.features) {
    const flags = options.features;
    builder = builder
      .overrideProvider(FeatureFlags)
      .useValue({ accountLink: flags.accountLink, view: () => ({ ...flags }) });
  }
  const moduleFixture = await builder
    .overrideProvider(SessionResolver)
    .useValue(auth.sessions)
    .overrideProvider(ConsentChecker)
    .useValue(auth.consents)
    .overrideProvider(MembershipLookup)
    .useValue(auth.memberships)
    .compile();
  const app =
    moduleFixture.createNestApplication<NestExpressApplication>(APP_OPTIONS);
  setupApp(app);
  await app.init();
  return { app, auth };
}

export class ExpenseFixtures {
  readonly userIds: string[] = [];
  readonly groupIds: string[] = [];
  readonly tripIds: string[] = [];

  constructor(readonly prisma: PrismaClient) {}

  /**
   * 오사카 3박 4일(11.12~11.15, JPY). 닉네임 순서 = 가입 순, 첫 사람이 그룹장.
   * period(KST 날짜)·currency로 기간·통화를, withPaymentMethod: false로 결제수단 없는 사용자를 만든다(S7 직접 입력)
   */
  async seedTrip(
    nicknames: string[] = ['준용', '민지', '태현', '수빈'],
    options: {
      status?: TripStatus;
      users?: Record<string, string>;
      period?: { start: string; end: string };
      currency?: string;
      withPaymentMethod?: boolean;
    } = {},
  ): Promise<SeedTrip> {
    const start = options.period?.start ?? '2026-11-12';
    const end = options.period?.end ?? '2026-11-15';
    const group = await this.prisma.group.create({
      data: { name: '오사카 먹방', inviteCode: inviteCode() },
    });
    this.groupIds.push(group.id);
    const trip = await this.prisma.trip.create({
      data: {
        groupId: group.id,
        placeLabel: '일본 오사카',
        countryCode: 'JP',
        currency: options.currency ?? 'JPY',
        startDate: new Date(`${start}T00:00:00Z`),
        endDate: new Date(`${end}T00:00:00Z`),
        startAt: kst(`${start} 00:00`),
        autoEndAt: new Date(`${end}T23:59:59+09:00`),
        budgetKrw: 1_200_000,
        status: options.status ?? 'ONGOING',
        startedAt: options.status === 'UPCOMING' ? null : new Date(),
      },
    });
    this.tripIds.push(trip.id);

    const members: Record<string, SeedMember> = {};
    for (const [index, nickname] of nicknames.entries()) {
      let userId = options.users?.[nickname];
      let paymentMethodId: string;
      if (!userId && options.withPaymentMethod === false) {
        const user = await this.prisma.user.create({
          data: { kakaoId: `test-${randomUUID()}`, nickname },
        });
        userId = user.id;
        this.userIds.push(userId);
        paymentMethodId = '';
      } else if (!userId) {
        const user = await this.prisma.user.create({
          data: { kakaoId: `test-${randomUUID()}`, nickname },
        });
        userId = user.id;
        this.userIds.push(userId);
        const connection = await this.prisma.paymentConnection.create({
          data: {
            userId,
            provider: 'DEMO',
            status: 'ACTIVE',
            accessTokenEnc: new Uint8Array([1, 2, 3]),
            connectedAt: new Date(),
          },
        });
        const method = await this.prisma.paymentMethod.create({
          data: {
            userId,
            connectionId: connection.id,
            type: 'CARD',
            institutionName: '토스뱅크',
            productName: '토스뱅크 체크카드',
            shortLabel: '토스뱅크 체크카드',
            maskedNumber: '5365-****-****-1934',
            last4: '1934',
            externalRef: randomUUID(),
          },
        });
        paymentMethodId = method.id;
      } else {
        const method = await this.prisma.paymentMethod.findFirst({
          where: { userId },
        });
        paymentMethodId = method?.id ?? '';
      }
      const membership = await this.prisma.membership.create({
        data: {
          groupId: group.id,
          userId,
          role: index === 0 ? 'LEADER' : 'MEMBER',
          joinOrder: index + 1,
        },
      });
      members[nickname] = {
        userId,
        membershipId: membership.id,
        paymentMethodId,
        nickname,
      };
    }
    return { tripId: trip.id, groupId: group.id, members };
  }

  async addTransaction(
    member: SeedMember,
    input: {
      at: Date;
      merchant: string;
      amount: string;
      currency?: string;
      kind?: 'APPROVAL' | 'CANCEL';
      cancelOf?: string;
      providerKrw?: number;
    },
  ) {
    return this.prisma.transaction.create({
      data: {
        userId: member.userId,
        paymentMethodId: member.paymentMethodId,
        externalRef: randomUUID(),
        kind: input.kind ?? 'APPROVAL',
        occurredAt: input.at,
        merchantNameRaw: input.merchant,
        merchantKey: merchantKeyOf(input.merchant),
        originalAmount: new Prisma.Decimal(input.amount),
        originalCurrency: input.currency ?? 'JPY',
        providerKrwAmount: input.providerKrw ?? null,
        cancelOfTransactionId: input.cancelOf ?? null,
      },
    });
  }

  /** 결제 1건(+원본 거래). SHARED면 부담 인원을 splitEvenly로 나눠 넣는다 */
  async addExpense(
    seed: SeedTrip,
    payer: string,
    input: {
      status: ExpenseStatus;
      at: string;
      merchant: string;
      amount: string;
      krw: number;
      currency?: string;
      participants?: string[];
      changedAfterShared?: boolean;
      transactionId?: string | null;
    },
  ) {
    const member = seed.members[payer];
    const currency = input.currency ?? 'JPY';
    const transactionId =
      input.transactionId === undefined
        ? (
            await this.addTransaction(member, {
              at: kst(input.at),
              merchant: input.merchant,
              amount: input.amount,
              currency,
            })
          ).id
        : input.transactionId;
    const participants = (input.participants ?? []).map((name) => ({
      membershipId: seed.members[name].membershipId,
      joinOrder: Object.keys(seed.members).indexOf(name) + 1,
    }));
    const split =
      input.status === 'SHARED'
        ? splitEvenly(input.krw, participants, member.membershipId)
        : null;
    return this.prisma.expense.create({
      data: {
        tripId: seed.tripId,
        transactionId,
        payerMembershipId: member.membershipId,
        status: input.status,
        occurredAt: kst(input.at),
        merchantName: input.merchant,
        originalAmount: new Prisma.Decimal(input.amount),
        originalCurrency: currency,
        krwAmount: input.krw,
        netKrwAmount: input.krw,
        firstSharedAt: input.status === 'SHARED' ? new Date() : null,
        confirmedAt: input.status === 'PENDING' ? null : new Date(),
        changedAfterShared: input.changedAfterShared ?? false,
        ...(split && {
          shares: {
            create: split.shares.map((s) => ({
              membershipId: s.membershipId,
              amountKrw: s.amountKrw,
              isRemainderHolder: s.isRemainderHolder,
            })),
          },
        }),
      },
    });
  }

  /** 취소 자식(부모와 같은 상태·결제자)을 붙이고 부모 순액을 고친다 */
  async addRefund(
    seed: SeedTrip,
    parentId: string,
    input: { at: string; amount: string; krw: number },
  ) {
    const parent = await this.prisma.expense.findUniqueOrThrow({
      where: { id: parentId },
    });
    const child = await this.prisma.expense.create({
      data: {
        tripId: seed.tripId,
        payerMembershipId: parent.payerMembershipId,
        status: parent.status,
        occurredAt: kst(input.at),
        merchantName: parent.merchantName,
        originalAmount: new Prisma.Decimal(input.amount),
        originalCurrency: parent.originalCurrency,
        krwAmount: input.krw,
        netKrwAmount: null,
        refundOfExpenseId: parent.id,
      },
    });
    await this.prisma.expense.update({
      where: { id: parent.id },
      data: { netKrwAmount: Math.max(0, parent.krwAmount + input.krw) },
    });
    return child;
  }

  async endTrip(tripId: string) {
    await this.prisma.trip.update({
      where: { id: tripId },
      data: { status: 'ENDED', endedAt: new Date(), endReason: 'MANUAL' },
    });
  }

  async leave(membershipId: string) {
    await this.prisma.membership.update({
      where: { id: membershipId },
      data: { leftAt: new Date(), leaveReason: 'LEFT' },
    });
  }

  async cleanup() {
    const tripIds = this.tripIds;
    const userIds = this.userIds;
    await this.prisma.expenseChangeLog.deleteMany({
      where: { tripId: { in: tripIds } },
    });
    await this.prisma.expense.deleteMany({
      where: { tripId: { in: tripIds }, refundOfExpenseId: { not: null } },
    });
    await this.prisma.expense.deleteMany({
      where: { tripId: { in: tripIds } },
    });
    await this.prisma.accessLog.deleteMany({
      where: { userId: { in: userIds } },
    });
    await this.prisma.transaction.updateMany({
      where: { userId: { in: userIds } },
      data: { cancelOfTransactionId: null },
    });
    await this.prisma.transaction.deleteMany({
      where: { userId: { in: userIds } },
    });
    await this.prisma.paymentMethod.deleteMany({
      where: { userId: { in: userIds } },
    });
    await this.prisma.paymentConnection.deleteMany({
      where: { userId: { in: userIds } },
    });
    await this.prisma.trip.deleteMany({ where: { id: { in: tripIds } } });
    await this.prisma.membership.deleteMany({
      where: { groupId: { in: this.groupIds } },
    });
    await this.prisma.group.deleteMany({
      where: { id: { in: this.groupIds } },
    });
    await this.prisma.user.deleteMany({ where: { id: { in: userIds } } });
  }
}
