import { randomUUID } from 'node:crypto';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { Test, type TestingModuleBuilder } from '@nestjs/testing';
import { PrismaPg } from '@prisma/adapter-pg';
import {
  splitEvenly,
  type FxPolicy,
  type MemberRole,
  type TripStatus,
} from '@yeojeong/shared';
import { config as loadEnv } from 'dotenv';
import { AppModule } from './../src/app.module.js';
import type { AuthUser } from './../src/common/auth/auth-context.js';
import { ConsentChecker, SessionResolver } from './../src/common/auth/index.js';
import { PrismaClient } from './../src/generated/prisma/client.js';
import { PrismaService } from './../src/prisma/prisma.service.js';
import { APP_OPTIONS, setupApp } from './../src/setup-app.js';
import type { TestAuth } from './auth-helpers.js';

// 실제 DB(로컬 docker, apps/api/.env의 DATABASE_URL)에 붙는 정산·환율 e2e용 도구.
// CI처럼 DB가 없으면 hasDatabase()가 false라 해당 describe를 건너뛴다.
// 로컬 DB는 다른 작업과 같이 쓰므로 무작위 ID로 만들고 만든 행만 지운다.

loadEnv({ quiet: true });

export const INTERNAL_SECRET = 'e2e-internal-job-secret-0123456789abcdef';

let probed: Promise<boolean> | undefined;

/** DATABASE_URL이 있고 1.5초 안에 SELECT 1이 되면 true */
export function hasDatabase(): Promise<boolean> {
  probed ??= (async () => {
    const url = process.env.DATABASE_URL;
    if (!url) return false;
    const client = new PrismaClient({
      adapter: new PrismaPg({
        connectionString: url,
        connectionTimeoutMillis: 1500,
      }),
    });
    try {
      await client.$queryRaw`SELECT 1`;
      return true;
    } catch {
      return false;
    } finally {
      await client.$disconnect().catch(() => undefined);
    }
  })();
  return probed;
}

/**
 * 운영과 같은 setupApp + 실제 Prisma + 실제 멤버십 조회. 로그인·동의만 스텁(test/auth-helpers.ts).
 * EventEmitterModule.forRoot()는 AppModule에 있다(중복 등록하지 않는다).
 */
export async function createDbTestApp(
  auth: TestAuth,
  customize: (builder: TestingModuleBuilder) => TestingModuleBuilder = (b) => b,
): Promise<NestExpressApplication> {
  process.env.INTERNAL_JOB_SECRET = INTERNAL_SECRET;
  const builder = Test.createTestingModule({
    imports: [AppModule],
  })
    .overrideProvider(SessionResolver)
    .useValue(auth.sessions)
    .overrideProvider(ConsentChecker)
    .useValue(auth.consents);
  const moduleRef = await customize(builder).compile();
  const app =
    moduleRef.createNestApplication<NestExpressApplication>(APP_OPTIONS);
  setupApp(app);
  await app.init();
  return app;
}

export interface FixtureMember {
  user: AuthUser;
  membershipId: string;
  joinOrder: number;
}

export interface FixtureTripInput {
  members: { nickname: string; role?: MemberRole }[];
  status?: TripStatus;
  budgetKrw?: number;
  currency?: string;
  fxPolicy?: FxPolicy;
  fxFixedRate?: string;
  startDate?: string;
  endDate?: string;
}

const INVITE_CHARS = '23456789ABCDEFGHJKMNPQRSTUVWXYZ';

function inviteCode() {
  return Array.from(
    { length: 6 },
    () => INVITE_CHARS[Math.floor(Math.random() * INVITE_CHARS.length)],
  ).join('');
}

/** 다른 모듈(trips·expenses)에 기대지 않고 Prisma로 장부 행을 직접 만든다 */
export class LedgerFixture {
  private readonly userIds: string[] = [];
  private readonly groupIds: string[] = [];
  private readonly tripIds: string[] = [];

  constructor(private readonly prisma: PrismaService) {}

  static from(app: NestExpressApplication) {
    return new LedgerFixture(app.get(PrismaService));
  }

  async createTrip(input: FixtureTripInput) {
    const startDate = input.startDate ?? '2026-11-12';
    const endDate = input.endDate ?? '2026-11-15';
    const status = input.status ?? 'ONGOING';
    const group = await this.prisma.group.create({
      data: { name: '오사카 테스트', inviteCode: inviteCode() },
    });
    this.groupIds.push(group.id);
    const members: FixtureMember[] = [];
    for (const [index, m] of input.members.entries()) {
      const user = await this.prisma.user.create({
        data: { kakaoId: `e2e-${randomUUID()}`, nickname: m.nickname },
      });
      this.userIds.push(user.id);
      const membership = await this.prisma.membership.create({
        data: {
          groupId: group.id,
          userId: user.id,
          role: m.role ?? (index === 0 ? 'LEADER' : 'MEMBER'),
          joinOrder: index + 1,
        },
      });
      members.push({
        user: { id: user.id, nickname: user.nickname, profileImageUrl: null },
        membershipId: membership.id,
        joinOrder: index + 1,
      });
    }
    const trip = await this.prisma.trip.create({
      data: {
        groupId: group.id,
        placeLabel: '일본 오사카',
        countryCode: 'JP',
        currency: input.currency ?? 'JPY',
        startDate: new Date(`${startDate}T00:00:00Z`),
        endDate: new Date(`${endDate}T00:00:00Z`),
        startAt: new Date(`${startDate}T00:00:00+09:00`),
        autoEndAt: new Date(`${endDate}T23:59:59+09:00`),
        budgetKrw: input.budgetKrw ?? 1_200_000,
        status,
        startedAt:
          status === 'UPCOMING'
            ? null
            : new Date(`${startDate}T09:00:00+09:00`),
        fxPolicy: input.fxPolicy ?? 'SPOT_AT_PAYMENT',
        fxFixedRate: input.fxFixedRate ?? null,
        ...(status === 'ENDED' && {
          endedAt: new Date(`${endDate}T20:00:00+09:00`),
          endReason: 'MANUAL' as const,
        }),
      },
    });
    this.tripIds.push(trip.id);
    return { tripId: trip.id, groupId: group.id, members };
  }

  /** SHARED 부모 + 균등 분할 몫. refundKrw(음수)를 주면 취소 자식을 붙여 순액을 줄인다 */
  async addShared(
    tripId: string,
    payer: FixtureMember,
    grossKrw: number,
    participants: FixtureMember[],
    options: {
      merchantName?: string;
      occurredAt?: string;
      refundKrw?: number;
      originalAmount?: string;
      currency?: string;
    } = {},
  ) {
    const net = Math.max(0, grossKrw + (options.refundKrw ?? 0));
    const split = splitEvenly(
      net,
      participants.map((p) => ({
        membershipId: p.membershipId,
        joinOrder: p.joinOrder,
      })),
      payer.membershipId,
    );
    const occurredAt = new Date(
      options.occurredAt ?? '2026-11-13T12:00:00+09:00',
    );
    const expense = await this.prisma.expense.create({
      data: {
        tripId,
        payerMembershipId: payer.membershipId,
        status: 'SHARED',
        occurredAt,
        merchantName: options.merchantName ?? '공동 가맹점',
        originalAmount: options.originalAmount ?? String(grossKrw),
        originalCurrency: options.currency ?? 'KRW',
        krwAmount: grossKrw,
        netKrwAmount: net,
        firstSharedAt: occurredAt,
        confirmedAt: occurredAt,
        shares: { create: split.shares },
      },
    });
    if (options.refundKrw) {
      await this.prisma.expense.create({
        data: {
          tripId,
          payerMembershipId: payer.membershipId,
          status: 'SHARED',
          occurredAt: new Date(occurredAt.getTime() + 60_000),
          merchantName: options.merchantName ?? '공동 가맹점',
          originalAmount: String(options.refundKrw),
          originalCurrency: 'KRW',
          krwAmount: options.refundKrw,
          refundOfExpenseId: expense.id,
        },
      });
    }
    return expense.id;
  }

  async addPrivate(
    tripId: string,
    payer: FixtureMember,
    krw: number,
    status: 'PERSONAL' | 'PENDING',
    merchantName = '개인 가맹점',
  ) {
    const expense = await this.prisma.expense.create({
      data: {
        tripId,
        payerMembershipId: payer.membershipId,
        status,
        occurredAt: new Date('2026-11-13T15:00:00+09:00'),
        merchantName,
        originalAmount: String(krw),
        originalCurrency: 'KRW',
        krwAmount: krw,
        netKrwAmount: krw,
      },
    });
    return expense.id;
  }

  async leave(
    member: FixtureMember,
    at = new Date('2026-11-14T10:00:00+09:00'),
  ) {
    await this.prisma.membership.update({
      where: { id: member.membershipId },
      data: { leftAt: at, leaveReason: 'LEFT' },
    });
  }

  /** trips 모듈의 종료 커밋을 흉내 낸다(정산은 만들지 않는다) */
  async end(tripId: string, at = new Date('2026-11-15T20:00:00+09:00')) {
    await this.prisma.trip.update({
      where: { id: tripId },
      data: { status: 'ENDED', endedAt: at, endReason: 'MANUAL' },
    });
  }

  settlementCount(tripId: string) {
    return this.prisma.settlement.count({ where: { tripId } });
  }

  /** 만든 행만 FK 순서대로 지운다 */
  async cleanup() {
    const tripIds = this.tripIds;
    await this.prisma.settlement.deleteMany({
      where: { tripId: { in: tripIds } },
    });
    await this.prisma.expenseChangeLog.deleteMany({
      where: { tripId: { in: tripIds } },
    });
    await this.prisma.expense.deleteMany({
      where: { tripId: { in: tripIds }, refundOfExpenseId: { not: null } },
    });
    await this.prisma.expense.deleteMany({
      where: { tripId: { in: tripIds } },
    });
    await this.prisma.tripEvent.deleteMany({
      where: { tripId: { in: tripIds } },
    });
    await this.prisma.trip.deleteMany({ where: { id: { in: tripIds } } });
    await this.prisma.membership.deleteMany({
      where: { groupId: { in: this.groupIds } },
    });
    await this.prisma.group.deleteMany({
      where: { id: { in: this.groupIds } },
    });
    await this.prisma.user.deleteMany({ where: { id: { in: this.userIds } } });
  }
}
