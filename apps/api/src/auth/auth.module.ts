import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ConsentsModule } from '../consents/consents.module.js';
import { UsersModule } from '../users/users.module.js';
import { AuthController } from './auth.controller.js';
import { AuthService } from './auth.service.js';
import { KakaoUnlinkController } from './kakao-unlink.controller.js';
import { HttpKakaoClient, KakaoClient } from './kakao/kakao.client.js';
import {
  KakaoUnlinkConfig,
  KakaoUnlinkService,
} from './kakao/kakao-unlink.service.js';

@Module({
  imports: [ConsentsModule, UsersModule],
  controllers: [AuthController, KakaoUnlinkController],
  providers: [
    AuthService,
    { provide: KakaoClient, useClass: HttpKakaoClient },
    {
      provide: KakaoUnlinkConfig,
      inject: [ConfigService],
      useFactory: (config: ConfigService) => new KakaoUnlinkConfig(config),
    },
    KakaoUnlinkService,
  ],
})
export class AuthModule {}
