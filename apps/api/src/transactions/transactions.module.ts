import { Module } from '@nestjs/common';
import { FxModule } from '../fx/fx.module.js';
import { PaymentProvidersModule } from '../payment-methods/providers/payment-providers.module.js';
import {
  DuplicateFlagger,
  expensesDuplicateFlagger,
} from './duplicate-flagger.js';
import { ImportService } from './import.service.js';
import { InternalJobGuard } from './internal-job.guard.js';
import { JobsController } from './jobs.controller.js';
import { OutOfPeriodLookupService } from './out-of-period-lookup.service.js';
import { SyncService } from './sync.service.js';
import { TripEventsListener } from './trip-events.listener.js';

/**
 * 거래 동기화·인입(기능명세 1-2의 imports + jobs/sync). 문서는 src/payment-methods/README.md.
 * 기간 외 후보는 OutOfPeriodLookupService가 제공자에서 즉시 조회하고, expenses가 고른 건만 저장한다.
 */
@Module({
  imports: [PaymentProvidersModule, FxModule],
  controllers: [JobsController],
  providers: [
    SyncService,
    ImportService,
    OutOfPeriodLookupService,
    TripEventsListener,
    InternalJobGuard,
    { provide: DuplicateFlagger, useValue: expensesDuplicateFlagger },
  ],
  exports: [SyncService, ImportService, OutOfPeriodLookupService],
})
export class TransactionsModule {}
