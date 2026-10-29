import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { APP_FILTER, APP_GUARD, APP_PIPE } from '@nestjs/core';
import { EventEmitterModule } from '@nestjs/event-emitter';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';
import { AccountModule } from './account/account.module.js';
import { AuditModule } from './audit/audit.module.js';
import {
  AuthCoreModule,
  AuthGuard,
  ConsentGuard,
  CsrfGuard,
  MembershipGuard,
  TripStatusGuard,
} from './common/auth/index.js';
import { AllExceptionsFilter } from './common/errors/all-exceptions.filter.js';
import { createValidationPipe } from './common/errors/validation.js';
import { LoggingModule } from './common/logging/logging.module.js';
import {
  InternalJobGuard,
  InternalJobModule,
} from './common/internal-job/index.js';
import { DEFAULT_THROTTLE } from './common/throttle.js';
import { AuthModule } from './auth/auth.module.js';
import { ConsentsModule } from './consents/consents.module.js';
import { ExpensesModule } from './expenses/expenses.module.js';
import { FxModule } from './fx/fx.module.js';
import { HealthModule } from './health/health.module.js';
import { PaymentMethodsModule } from './payment-methods/payment-methods.module.js';
import { PrismaModule } from './prisma/prisma.module.js';
import { RetentionModule } from './retention/retention.module.js';
import { SettlementsModule } from './settlements/settlements.module.js';
import { TripsModule } from './trips/trips.module.js';
import { UsersModule } from './users/users.module.js';
import { WalletModule } from './wallet/wallet.module.js';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    LoggingModule,
    ThrottlerModule.forRoot([DEFAULT_THROTTLE]),
    PrismaModule,
    AuthCoreModule,
    InternalJobModule,
    EventEmitterModule.forRoot(),
    // 기능 모듈은 아래에 한 줄씩 추가한다(apps/api/README.md "모듈 추가")
    HealthModule,
    TripsModule,
    AuditModule,
    AccountModule,
    RetentionModule,
    ExpensesModule,
    FxModule,
    SettlementsModule,
    AuthModule,
    UsersModule,
    ConsentsModule,
    PaymentMethodsModule,
    WalletModule,
  ],
  providers: [
    { provide: APP_PIPE, useValue: createValidationPipe() },
    // 전역 가드는 이 순서대로 돈다. 순서를 바꾸지 않는다.
    { provide: APP_GUARD, useClass: ThrottlerGuard },
    { provide: APP_GUARD, useClass: CsrfGuard },
    { provide: APP_GUARD, useClass: InternalJobGuard },
    { provide: APP_GUARD, useClass: AuthGuard },
    { provide: APP_GUARD, useClass: ConsentGuard },
    { provide: APP_GUARD, useClass: MembershipGuard },
    { provide: APP_GUARD, useClass: TripStatusGuard },
    { provide: APP_FILTER, useClass: AllExceptionsFilter },
  ],
})
export class AppModule {}
