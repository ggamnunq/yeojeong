import { Module } from '@nestjs/common';
import { ExpensesModule } from '../expenses/expenses.module.js';
import { WalletController } from './wallet.controller.js';
import { WalletService } from './wallet.service.js';

/**
 * 내 지갑(S7): 직접 입력한 결제와 가져온 거래를 함께 보여 주고, 직접 입력은 여정에 자동 연결한다.
 * 계좌·카드 연결(토스)은 src/payment-methods. 연결 화면 노출은 기능 플래그 accountLink(GET /api/auth/session)로 정한다.
 */
@Module({
  imports: [ExpensesModule],
  controllers: [WalletController],
  providers: [WalletService],
})
export class WalletModule {}
