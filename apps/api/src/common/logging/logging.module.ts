import { Global, Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { LoggerModule } from 'nestjs-pino';
import type { Logger } from 'pino';
import { createLogger } from './logger.js';

export const PINO_LOGGER = Symbol('PINO_LOGGER');

@Global()
@Module({
  providers: [
    {
      provide: PINO_LOGGER,
      inject: [ConfigService],
      useFactory: (config: ConfigService) => createLogger(config),
    },
  ],
  exports: [PINO_LOGGER],
})
class PinoRootModule {}

/**
 * 요청 로그(pino-http)는 helmet·origin lock·본문 파서보다 먼저 돌아야 403·413도 남고 요청 ID가 붙는다.
 * 그래서 setupApp이 맨 앞에 직접 붙이고(createHttpLogger), nestjs-pino는 그 req.log를 그대로 쓴다(useExisting).
 */
@Module({
  imports: [
    PinoRootModule,
    LoggerModule.forRootAsync({
      imports: [PinoRootModule],
      inject: [PINO_LOGGER],
      useFactory: (logger: Logger) => ({
        pinoHttp: { logger },
        useExisting: true,
      }),
    }),
  ],
})
export class LoggingModule {}
