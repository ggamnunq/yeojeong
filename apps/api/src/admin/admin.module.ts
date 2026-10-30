import {
  Module,
  RequestMethod,
  type MiddlewareConsumer,
  type NestModule,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { AccountModule } from '../account/account.module.js';
import { CardImportModule } from '../card-import/card-import.module.js';
import { AdminAuditLog } from './admin-audit.js';
import { AdminAuthController } from './admin-auth.controller.js';
import { AdminCodefController } from './admin-codef.controller.js';
import { AdminCodefService } from './admin-codef.service.js';
import { AdminConfig } from './admin-config.js';
import { AdminCredentials } from './admin-credentials.js';
import { AdminDeviceService } from './admin-device.js';
import { AdminFeatureGrantsController } from './admin-feature-grants.controller.js';
import { AdminFeatureGrantsService } from './admin-feature-grants.service.js';
import { AdminTotpGuard } from './admin-totp-guard.js';
import { AdminGateMiddleware } from './admin-gate.middleware.js';
import { AdminLoginThrottle } from './admin-login-throttle.js';
import { AdminSessionService } from './admin-session.service.js';
import { AdminUsersController } from './admin-users.controller.js';
import { AdminUsersService } from './admin-users.service.js';
import { AdminSessionGuard } from './admin.guard.js';

/**
 * 운영자 전용 관리자 페이지 API(/api/admin/*): 회원 관리 · CODEF 호출 현황 · 회원별 기능 권한. 사용법·보안 설계는 src/admin/README.md.
 * env ADMIN_USERNAME·ADMIN_PASSWORD_HASH·ADMIN_TOTP_SECRET 중 하나라도 없으면 AdminGateMiddleware가 모든 /api/admin/* 를 404로 막는다(운영 기본 꺼짐).
 */
@Module({
  imports: [AccountModule, CardImportModule],
  controllers: [
    AdminAuthController,
    AdminUsersController,
    AdminCodefController,
    AdminFeatureGrantsController,
  ],
  providers: [
    {
      provide: AdminConfig,
      inject: [ConfigService],
      useFactory: (config: ConfigService) => AdminConfig.fromConfig(config),
    },
    AdminSessionService,
    AdminSessionGuard,
    AdminLoginThrottle,
    AdminTotpGuard,
    AdminCredentials,
    AdminDeviceService,
    AdminAuditLog,
    AdminUsersService,
    AdminCodefService,
    AdminFeatureGrantsService,
  ],
})
export class AdminModule implements NestModule {
  configure(consumer: MiddlewareConsumer) {
    consumer
      .apply(AdminGateMiddleware)
      .forRoutes(
        { path: 'admin', method: RequestMethod.ALL },
        { path: 'admin/*path', method: RequestMethod.ALL },
      );
  }
}
