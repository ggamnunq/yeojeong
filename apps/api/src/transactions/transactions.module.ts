import { Module } from '@nestjs/common';
import { PaymentProvidersModule } from '../payment-methods/providers/payment-providers.module.js';
import { DuplicateSuspicionService } from './duplicate-suspicion.service.js';
import { ImportService } from './import.service.js';
import { InternalJobGuard } from './internal-job.guard.js';
import { JobsController } from './jobs.controller.js';
import { OutOfPeriodService } from './out-of-period.service.js';
import { SyncService } from './sync.service.js';
import { TripEventsListener } from './trip-events.listener.js';

/**
 * 거래 동기화·인입(기능명세 1-2의 imports + jobs/sync). 문서는 src/payment-methods/README.md.
 * S2B-2(expenses)는 이 모듈을 import해서 DuplicateSuspicionService·OutOfPeriodService·ImportService를 쓴다.
 */
@Module({
  imports: [PaymentProvidersModule],
  controllers: [JobsController],
  providers: [
    SyncService,
    ImportService,
    DuplicateSuspicionService,
    OutOfPeriodService,
    TripEventsListener,
    InternalJobGuard,
  ],
  exports: [SyncService, ImportService, DuplicateSuspicionService, OutOfPeriodService],
})
export class TransactionsModule {}
