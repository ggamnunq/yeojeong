import { Module } from '@nestjs/common';
import { TransactionsModule } from '../transactions/transactions.module.js';
import { ExpenseCommandService } from './expense-command.service.js';
import { ExpenseLifecycleService } from './expense-lifecycle.service.js';
import { ExpenseQueryService } from './expense-query.service.js';
import { ExpenseStatsService } from './expense-stats.service.js';
import { ExpensesController } from './expenses.controller.js';
import { OutOfPeriodService } from './out-of-period.service.js';
import { TripEndedListener } from './trip-ended.listener.js';

/**
 * 결제(장부) 모듈: 조회·분류·분담·중복 해제·기간 외 추가, trip.ended 구독(미확정 → 개인).
 * 정산(S2C)은 ExpenseStatsService(개인 결제 건수)·ExpenseQueryService.paymentsByPayer(멤버별 결제 내역)를 쓴다.
 * trip.ended를 받으려면 앱에 EventEmitterModule.forRoot()가 있어야 한다(S2A가 등록).
 */
@Module({
  imports: [TransactionsModule],
  controllers: [ExpensesController],
  providers: [
    ExpenseQueryService,
    ExpenseCommandService,
    ExpenseLifecycleService,
    ExpenseStatsService,
    OutOfPeriodService,
    TripEndedListener,
  ],
  exports: [ExpenseQueryService, ExpenseStatsService, ExpenseLifecycleService],
})
export class ExpensesModule {}
