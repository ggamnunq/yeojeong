import { Global, Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { AuthConfig } from './auth-config.js';
import { ConsentCatalog } from './consent-catalog.js';
import { ConsentChecker, PrismaConsentChecker } from './consent-checker.js';
import {
  MembershipLookup,
  PrismaMembershipLookup,
} from './membership-lookup.js';
import { SessionResolver, SessionService } from './session-resolver.js';
import { WebConfig } from './web-config.js';
import { AccountLinkGuard, FeatureFlags } from '../features.js';

/** 전역 가드와 auth 모듈이 쓰는 설정·조회 서비스. 테스트는 test/auth-helpers.ts의 스텁으로 바꿔 끼운다 */
@Global()
@Module({
  providers: [
    {
      provide: WebConfig,
      inject: [ConfigService],
      useFactory: (config: ConfigService) => new WebConfig(config),
    },
    {
      provide: AuthConfig,
      inject: [ConfigService],
      useFactory: (config: ConfigService) => new AuthConfig(config),
    },
    SessionService,
    { provide: SessionResolver, useExisting: SessionService },
    ConsentCatalog,
    { provide: ConsentChecker, useClass: PrismaConsentChecker },
    { provide: MembershipLookup, useClass: PrismaMembershipLookup },
    FeatureFlags,
    AccountLinkGuard,
  ],
  exports: [
    FeatureFlags,
    AccountLinkGuard,
    WebConfig,
    AuthConfig,
    SessionService,
    SessionResolver,
    ConsentCatalog,
    ConsentChecker,
    MembershipLookup,
  ],
})
export class AuthCoreModule {}
