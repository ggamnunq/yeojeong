import { Injectable, OnModuleDestroy } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '../generated/prisma/client.js';

@Injectable()
export class PrismaService extends PrismaClient implements OnModuleDestroy {
  constructor(config: ConfigService) {
    super({
      adapter: new PrismaPg({
        connectionString: config.getOrThrow<string>('DATABASE_URL'),
      }),
      // 기본 형식은 오류 메시지에 쿼리와 입력값을 그려 넣어 로그에 개인정보가 섞일 수 있다
      errorFormat: 'minimal',
    });
  }

  async onModuleDestroy() {
    await this.$disconnect();
  }
}
