import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { FxController, FxJobController } from './fx.controller.js';
import { FxJobService } from './fx-job.service.js';
import { FxPolicyService } from './fx-policy.service.js';
import { createFxRateSource, FX_RATE_SOURCE } from './fx-rate-source.js';
import { FxRatesService } from './fx-rates.service.js';
import { FxRecalcService } from './fx-recalc.service.js';

/**
 * 환율 수집·조회, 여정 환율 정책, 원화 환산·재계산(기능명세 1-2 fx).
 * 다른 모듈은 FxRatesService.convertForTrip(인입 환산)과 convert.ts의 순수 함수를 쓴다.
 */
@Module({
  controllers: [FxController, FxJobController],
  providers: [
    FxRatesService,
    FxRecalcService,
    FxPolicyService,
    FxJobService,
    {
      provide: FX_RATE_SOURCE,
      inject: [ConfigService],
      useFactory: createFxRateSource,
    },
  ],
  exports: [FxRatesService, FxRecalcService],
})
export class FxModule {}
