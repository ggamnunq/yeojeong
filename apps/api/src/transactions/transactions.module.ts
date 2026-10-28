import { Module } from '@nestjs/common';
import { PaymentProvidersModule } from '../payment-methods/providers/payment-providers.module.js';
import {
  DuplicateFlagger,
  expensesDuplicateFlagger,
} from './duplicate-flagger.js';
import { ImportService } from './import.service.js';
import { InternalJobGuard } from './internal-job.guard.js';
import { JobsController } from './jobs.controller.js';
import { SyncService } from './sync.service.js';
import { TripEventsListener } from './trip-events.listener.js';

/**
 * 거래 동기화·인입(기능명세 1-2의 imports + jobs/sync). 문서는 src/payment-methods/README.md.
 * 기간 외 후보·추가 API는 S2B-2(expenses)가 저장된 Transaction으로 처리하고, 이 모듈은 그 거래를 가져와 보관한다.
 */
@Module({
  imports: [PaymentProvidersModule],
  controllers: [JobsController],
  providers: [
    SyncService,
    ImportService,
    TripEventsListener,
    InternalJobGuard,
    { provide: DuplicateFlagger, useValue: expensesDuplicateFlagger },
  ],
  exports: [SyncService, ImportService],
})
export class TransactionsModule {}
