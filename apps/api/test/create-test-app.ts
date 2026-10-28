import type { Type } from '@nestjs/common';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { Test } from '@nestjs/testing';
import { AppModule } from './../src/app.module.js';
import { PrismaService } from './../src/prisma/prisma.service.js';
import { APP_OPTIONS, setupApp } from './../src/setup-app.js';

// 운영과 같은 setupApp을 거친 앱을 DB 없이 띄운다.
export async function createTestApp(controllers: Type[] = []) {
  const moduleFixture = await Test.createTestingModule({
    imports: [AppModule],
    controllers,
  })
    .overrideProvider(PrismaService)
    .useValue({ $queryRaw: vi.fn().mockResolvedValue([]) })
    .compile();

  const app =
    moduleFixture.createNestApplication<NestExpressApplication>(APP_OPTIONS);
  setupApp(app);
  await app.init();
  return app;
}
