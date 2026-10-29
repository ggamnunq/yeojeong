import { randomUUID } from 'node:crypto';
import type { DynamicModule, Type } from '@nestjs/common';
import { EventEmitterModule } from '@nestjs/event-emitter';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { Test } from '@nestjs/testing';
import type { TripStatus } from '@yeojeong/shared';
import { AppModule } from './../src/app.module.js';
import {
  ConsentChecker,
  MembershipLookup,
  SessionResolver,
} from './../src/common/auth/index.js';
import { kstDate, kstDateTime } from './../src/payment-methods/kst.js';
import { DemoTossAdapter } from './../src/payment-methods/providers/demo/demo-toss.adapter.js';
import { prismaDemoAnchor } from './../src/payment-methods/providers/payment-providers.module.js';
import {
  PaymentProviderAdapter,
  ProviderError,
  type AuthorizeHint,
  type ProviderErrorCode,
  type ProviderTokens,
} from './../src/payment-methods/providers/payment-provider.adapter.js';
import { PrismaService } from './../src/prisma/prisma.service.js';
import { APP_OPTIONS, setupApp } from './../src/setup-app.js';
import type { TestAuth } from './auth-helpers.js';

/** 장애를 흉내 낼 수 있는 DEMO 어댑터(자가 복구·만료 테스트용) */
export class FaultyDemoAdapter extends PaymentProviderAdapter {
  readonly provider = 'DEMO' as const;
  failList: ProviderErrorCode | null = null;
  failRefresh: ProviderErrorCode | null = null;
  listCalls = 0;

  constructor(private readonly inner: DemoTossAdapter) {
    super();
  }

  buildAuthorizeUrl(input: {
    state: string;
    redirectUri: string;
    hint: AuthorizeHint;
  }) {
    return this.inner.buildAuthorizeUrl(input);
  }

  exchangeCode(input: { code: string; redirectUri: string }) {
    return this.inner.exchangeCode(input);
  }

  refreshTokens(tokens: ProviderTokens) {
    if (this.failRefresh)
      return Promise.reject(new ProviderError(this.failRefresh));
    return this.inner.refreshTokens(tokens);
  }

  listPaymentMethods(tokens: ProviderTokens) {
    return this.inner.listPaymentMethods(tokens);
  }

  listTransactions(
    tokens: ProviderTokens,
    input: { methodRef: string; from: Date; to: Date; cursor?: string },
  ) {
    this.listCalls += 1;
    if (this.failList) return Promise.reject(new ProviderError(this.failList));
    return this.inner.listTransactions(tokens, input);
  }

  revoke() {
    return this.inner.revoke();
  }
}

/** S2A가 app.module에 EventEmitterModule.forRoot()를 넣기 전/후 모두 동작하게 한 번만 등록한다 */
function eventEmitterIfMissing(): DynamicModule[] {
  const imports = (Reflect.getMetadata('imports', AppModule) ?? []) as (
    Type | DynamicModule
  )[];
  const has = imports.some(
    (m) =>
      (m as DynamicModule).module === EventEmitterModule ||
      m === EventEmitterModule,
  );
  return has ? [] : [EventEmitterModule.forRoot()];
}

/** 결제수단 e2e용 앱: 인증 스텁 + (선택) 실DB + 장애 주입 DEMO 어댑터 + 이벤트 버스 */
export async function createPaymentTestApp(options: {
  auth: TestAuth;
  prisma?: object | 'real';
  /** 실DB의 동의 이력·멤버십으로 판정한다(스텁 대신). 로그인만 스텁이다 */
  realGuards?: boolean;
}): Promise<{ app: NestExpressApplication; adapter: FaultyDemoAdapter }> {
  let builder = Test.createTestingModule({
    imports: [AppModule, ...eventEmitterIfMissing()],
  })
    .overrideProvider(SessionResolver)
    .useValue(options.auth.sessions);
  if (!options.realGuards) {
    builder = builder
      .overrideProvider(ConsentChecker)
      .useValue(options.auth.consents)
      .overrideProvider(MembershipLookup)
      .useValue(options.auth.memberships);
  }
  builder = builder.overrideProvider(PaymentProviderAdapter).useFactory({
    factory: (prisma: PrismaService) =>
      new FaultyDemoAdapter(new DemoTossAdapter(prismaDemoAnchor(prisma))),
    inject: [PrismaService],
  });
  if (options.prisma !== 'real') {
    builder = builder
      .overrideProvider(PrismaService)
      .useValue(options.prisma ?? { $queryRaw: vi.fn().mockResolvedValue([]) });
  }
  const moduleFixture = await builder.compile();
  const app =
    moduleFixture.createNestApplication<NestExpressApplication>(APP_OPTIONS);
  setupApp(app);
  await app.init();
  return { app, adapter: app.get(PaymentProviderAdapter) };
}

const INVITE_CHARS = '23456789ABCDEFGHJKMNPQRSTUVWXYZ';

function addDays(date: string, days: number): string {
  const d = new Date(`${date}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

export interface SeededTrip {
  tripId: string;
  groupId: string;
  startDate: string;
  startAt: Date;
  users: { id: string; nickname: string; membershipId: string | null }[];
}

/**
 * 실DB에 사용자·그룹·여정·멤버십을 만든다. 날짜는 오늘(KST) 기준 상대값이라 DEMO 샘플(D1~D4)이 모두 지난 시각이 된다.
 * members에 member: false를 주면 사용자만 만들고 멤버로 넣지 않는다(나중에 참여시키는 테스트용).
 */
export async function seedTrip(
  prisma: PrismaService,
  input: {
    members: { nickname: string; member?: boolean }[];
    status: TripStatus;
    startOffsetDays?: number;
    endOffsetDays?: number;
  },
): Promise<SeededTrip> {
  const today = kstDate(new Date());
  const startDate = addDays(today, input.startOffsetDays ?? -10);
  const endDate = addDays(today, input.endOffsetDays ?? 5);
  const users = [];
  for (const m of input.members) {
    const user = await prisma.user.create({
      data: { kakaoId: `s2b-test-${randomUUID()}`, nickname: m.nickname },
      select: { id: true, nickname: true },
    });
    users.push({ ...user, member: m.member !== false });
  }
  const code = Array.from(
    { length: 6 },
    () => INVITE_CHARS[Math.floor(Math.random() * INVITE_CHARS.length)],
  ).join('');
  const group = await prisma.group.create({
    data: {
      name: 'S2B 테스트',
      inviteCode: code,
      createdByUserId: users[0].id,
    },
  });
  const startAt = kstDateTime(startDate, 0, '00:00');
  const trip = await prisma.trip.create({
    data: {
      groupId: group.id,
      placeLabel: '일본 오사카',
      countryCode: 'JP',
      currency: 'JPY',
      startDate: new Date(`${startDate}T00:00:00Z`),
      endDate: new Date(`${endDate}T00:00:00Z`),
      startAt,
      autoEndAt: kstDateTime(endDate, 0, '23:59:59'),
      budgetKrw: 1_200_000,
      status: input.status,
      startedAt: input.status === 'ONGOING' ? new Date() : null,
    },
  });
  const out: SeededTrip['users'] = [];
  let order = 0;
  for (const u of users) {
    if (!u.member) {
      out.push({ id: u.id, nickname: u.nickname, membershipId: null });
      continue;
    }
    order += 1;
    const membership = await prisma.membership.create({
      data: {
        groupId: group.id,
        userId: u.id,
        role: order === 1 ? 'LEADER' : 'MEMBER',
        joinOrder: order,
      },
    });
    out.push({ id: u.id, nickname: u.nickname, membershipId: membership.id });
  }
  return { tripId: trip.id, groupId: group.id, startDate, startAt, users: out };
}

/** 테스트가 만든 데이터를 지운다(외래 키 순서대로) */
export async function cleanupSeed(prisma: PrismaService, seeds: SeededTrip[]) {
  const tripIds = seeds.map((s) => s.tripId);
  const groupIds = seeds.map((s) => s.groupId);
  const userIds = seeds.flatMap((s) => s.users.map((u) => u.id));
  await prisma.expenseChangeLog.deleteMany({
    where: { tripId: { in: tripIds } },
  });
  await prisma.expenseShare.deleteMany({
    where: { expense: { tripId: { in: tripIds } } },
  });
  await prisma.expense.deleteMany({
    where: { tripId: { in: tripIds }, refundOfExpenseId: { not: null } },
  });
  await prisma.expense.deleteMany({ where: { tripId: { in: tripIds } } });
  await prisma.transaction.deleteMany({ where: { userId: { in: userIds } } });
  await prisma.paymentMethod.deleteMany({ where: { userId: { in: userIds } } });
  await prisma.connectionAttempt.deleteMany({
    where: { userId: { in: userIds } },
  });
  await prisma.paymentConnection.deleteMany({
    where: { userId: { in: userIds } },
  });
  await prisma.accessLog.deleteMany({ where: { userId: { in: userIds } } });
  await prisma.userConsent.deleteMany({ where: { userId: { in: userIds } } });
  await prisma.membership.deleteMany({ where: { groupId: { in: groupIds } } });
  await prisma.trip.deleteMany({ where: { id: { in: tripIds } } });
  await prisma.group.deleteMany({ where: { id: { in: groupIds } } });
  await prisma.user.deleteMany({ where: { id: { in: userIds } } });
}
