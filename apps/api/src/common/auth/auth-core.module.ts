import { Global, Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ConsentChecker, PrismaConsentChecker } from './consent-checker.js';
import {
  MembershipLookup,
  PrismaMembershipLookup,
} from './membership-lookup.js';
import { CookieSessionResolver, SessionResolver } from './session-resolver.js';
import { WebConfig } from './web-config.js';

/** 전역 가드가 쓰는 조회 서비스. 테스트는 test/auth-helpers.ts의 스텁으로 바꿔 끼운다 */
@Global()
@Module({
  providers: [
    {
      provide: WebConfig,
      inject: [ConfigService],
      useFactory: (config: ConfigService) => new WebConfig(config),
    },
    { provide: SessionResolver, useClass: CookieSessionResolver },
    { provide: ConsentChecker, useClass: PrismaConsentChecker },
    { provide: MembershipLookup, useClass: PrismaMembershipLookup },
  ],
  exports: [WebConfig, SessionResolver, ConsentChecker, MembershipLookup],
})
export class AuthCoreModule {}
