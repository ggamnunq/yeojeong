import { ConfigService } from '@nestjs/config';
import { NestFactory } from '@nestjs/core';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { AppModule } from './app.module.js';
import { APP_OPTIONS, setupApp } from './setup-app.js';

async function bootstrap() {
  const app = await NestFactory.create<NestExpressApplication>(
    AppModule,
    APP_OPTIONS,
  );
  setupApp(app);

  await app.listen(app.get(ConfigService).get<string>('PORT') ?? 3000);
}
await bootstrap();
