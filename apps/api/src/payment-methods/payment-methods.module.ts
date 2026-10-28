import { Module } from '@nestjs/common';
import { TransactionsModule } from '../transactions/transactions.module.js';
import { ConnectionsController } from './connections.controller.js';
import { ConnectionsService } from './connections.service.js';
import { PaymentMethodsController } from './payment-methods.controller.js';
import { PaymentMethodsService } from './payment-methods.service.js';
import { PaymentProvidersModule } from './providers/payment-providers.module.js';

/**
 * 지갑(기능명세 1-2 wallet): 토스 연결 시도·확정, 결제수단 목록·해제, 수동 동기화.
 * 거래 동기화·인입은 TransactionsModule(src/transactions)이고 이 모듈이 함께 불러온다(app.module에는 이 모듈 한 줄).
 * 문서: src/payment-methods/README.md
 */
@Module({
  imports: [PaymentProvidersModule, TransactionsModule],
  controllers: [ConnectionsController, PaymentMethodsController],
  providers: [ConnectionsService, PaymentMethodsService],
  exports: [TransactionsModule, PaymentProvidersModule],
})
export class PaymentMethodsModule {}
