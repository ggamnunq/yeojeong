import type { Type } from '@nestjs/common';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { Test } from '@nestjs/testing';
import type { Logger } from 'pino';
import { AppModule } from './../src/app.module.js';
import { PINO_LOGGER } from './../src/common/logging/logging.module.js';
import { PrismaService } from './../src/prisma/prisma.service.js';
import { APP_OPTIONS, setupApp } from './../src/setup-app.js';

interface TestAppOptions {
  // 로그를 확인할 때만 넘긴다. 기본은 NODE_ENV=test라 출력하지 않는다.
  logger?: Logger;
}

// 운영과 같은 setupApp을 거친 앱을 DB 없이 띄운다.
export async function createTestApp(
  controllers: Type[] = [],
  options: TestAppOptions = {},
) {
  let builder = Test.createTestingModule({
    imports: [AppModule],
    controllers,
  })
    .overrideProvider(PrismaService)
    .useValue({ $queryRaw: vi.fn().mockResolvedValue([]) });
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
