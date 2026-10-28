import { Module } from '@nestjs/common';
import { ConsentsModule } from '../consents/consents.module.js';
import { UsersModule } from '../users/users.module.js';
import { AuthController } from './auth.controller.js';
import { AuthService } from './auth.service.js';
import { HttpKakaoClient, KakaoClient } from './kakao/kakao.client.js';

@Module({
  imports: [ConsentsModule, UsersModule],
  controllers: [AuthController],
  providers: [AuthService, { provide: KakaoClient, useClass: HttpKakaoClient }],
})
export class AuthModule {}
