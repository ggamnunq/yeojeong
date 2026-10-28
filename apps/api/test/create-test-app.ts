import type { Type } from '@nestjs/common';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { Test } from '@nestjs/testing';
import type { Logger } from 'pino';
import { AppModule } from './../src/app.module.js';
import {
  ConsentChecker,
  MembershipLookup,
  SessionResolver,
} from './../src/common/auth/index.js';
import { PINO_LOGGER } from './../src/common/logging/logging.module.js';
import { PrismaService } from './../src/prisma/prisma.service.js';
import { APP_OPTIONS, setupApp } from './../src/setup-app.js';
import { createTestAuth, type TestAuth } from './auth-helpers.js';

interface TestAppOptions {
  // 로그를 확인할 때만 넘긴다. 기본은 NODE_ENV=test라 출력하지 않는다.
  logger?: Logger;
  /** 로그인·동의·멤버십 스텁(test/auth-helpers.ts). 없으면 모든 요청이 비로그인이다 */
  auth?: TestAuth;
  /** PrismaService 대체값. 기본은 헬스 체크만 되는 가짜. 'real'이면 로컬 DB(DATABASE_URL)에 붙는다 */
  prisma?: object | 'real';
}

// 운영과 같은 setupApp을 거친 앱을 DB 없이 띄운다.
export async function createTestApp(
  controllers: Type[] = [],
  options: TestAppOptions = {},
) {
  const auth = options.auth ?? createTestAuth();
  let builder = Test.createTestingModule({
    imports: [AppModule],
    controllers,
  })
    .overrideProvider(SessionResolver)
    .useValue(auth.sessions)
    .overrideProvider(ConsentChecker)
    .useValue(auth.consents)
    .overrideProvider(MembershipLookup)
    .useValue(auth.memberships);
  if (options.prisma !== 'real') {
    builder = builder
      .overrideProvider(PrismaService)
      .useValue(options.prisma ?? { $queryRaw: vi.fn().mockResolvedValue([]) });
  }
  if (options.logger) {
    builder = builder.overrideProvider(PINO_LOGGER).useValue(options.logger);
  }
  const moduleFixture = await builder.compile();

  const app =
    moduleFixture.createNestApplication<NestExpressApplication>(APP_OPTIONS);
  setupApp(app);
  await app.init();
  return app;
}
