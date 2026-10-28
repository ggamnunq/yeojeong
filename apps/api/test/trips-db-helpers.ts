import { randomUUID } from 'node:crypto';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { EventEmitter2 } from '@nestjs/event-emitter';
import type { AuthUser } from './../src/common/auth/auth-context.js';
import {
  MembershipLookup,
  type MembershipLookupResult,
  type MembershipQuery,
} from './../src/common/auth/index.js';
import { PrismaMembershipLookup } from './../src/common/auth/membership-lookup.js';
import { PrismaService } from './../src/prisma/prisma.service.js';
import { createTestAuth, type TestAuth } from './auth-helpers.js';
import { createTestApp } from './create-test-app.js';

// S2A 실제 DB e2e 도우미. TEST_DATABASE_URL(이름이 _test로 끝나는 전용 DB)이 있을 때만 쓴다.
// 예: TEST_DATABASE_URL=postgresql://yeojeong:yeojeong@localhost:5432/yeojeong_s2a_test pnpm --filter @yeojeong/api test:e2e

export const TEST_DATABASE_URL = process.env.TEST_DATABASE_URL;
export const JOB_SECRET = 'test-internal-job-secret-0123456789abcdef';

/** createTestApp은 멤버십 조회를 스텁으로 바꾼다. 실제 DB 테스트는 앱이 뜬 뒤 진짜 조회로 이어 준다 */
class LazyMembershipLookup extends MembershipLookup {
  inner?: MembershipLookup;

  find(query: MembershipQuery): Promise<MembershipLookupResult | null> {
    if (!this.inner) throw new Error('membership lookup is not ready');
    return this.inner.find(query);
  }
}

export interface PublishedEvent {
  name: string;
  payload: Record<string, unknown>;
}

export interface RealDbContext {
  app: NestExpressApplication;
  auth: TestAuth;
  prisma: PrismaService;
  events: PublishedEvent[];
  /** DB에 users 행까지 만든 로그인 사용자 */
  addUser(nickname: string): Promise<AuthUser>;
}

export async function createRealDbApp(): Promise<RealDbContext> {
  process.env.DATABASE_URL = TEST_DATABASE_URL;
  process.env.INTERNAL_JOB_SECRET = JOB_SECRET;
  const auth = createTestAuth();
  const lookup = new LazyMembershipLookup();
  const app = await createTestApp([], {
    auth: { ...auth, memberships: lookup } as unknown as TestAuth,
    prisma: 'real',
  });
  const prisma = app.get(PrismaService);
  lookup.inner = new PrismaMembershipLookup(prisma);

  const [{ db }] = await prisma.$queryRaw<
    { db: string }[]
  >`SELECT current_database() AS db`;
  if (!db.endsWith('_test')) {
    throw new Error(
      `TEST_DATABASE_URL은 이름이 _test로 끝나는 DB여야 합니다: ${db}`,
    );
  }
  // users·groups에 걸린 행(멤버십·여정·이벤트·결제·정산 등)을 모두 비운다
  await prisma.$executeRawUnsafe(
    'TRUNCATE users, groups RESTART IDENTITY CASCADE',
  );

  const events: PublishedEvent[] = [];
  app.get(EventEmitter2).onAny((name, payload) => {
    events.push({
      name: String(name),
      payload: payload as Record<string, unknown>,
    });
  });

  return {
    app,
    auth,
    prisma,
    events,
    async addUser(nickname: string) {
      const user = auth.addUser({ nickname });
      await prisma.user.create({
        data: { id: user.id, kakaoId: `test-${randomUUID()}`, nickname },
      });
      return user;
    },
  };
}
