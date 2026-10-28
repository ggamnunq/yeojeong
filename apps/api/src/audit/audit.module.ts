import { Global, Module } from '@nestjs/common';
import { APP_INTERCEPTOR } from '@nestjs/core';
import { AuditInterceptor } from './audit.interceptor.js';
import { AuditService } from './audit.service.js';

/**
 * 금융 데이터 접근 로그. 전역이라 다른 모듈은 import 없이 @Audited()를 붙이거나 AuditService를 주입한다.
 * 사용법은 src/retention/README.md "감사 로그".
 */
@Global()
@Module({
  providers: [
    AuditService,
    { provide: APP_INTERCEPTOR, useClass: AuditInterceptor },
  ],
  exports: [AuditService],
})
export class AuditModule {}
