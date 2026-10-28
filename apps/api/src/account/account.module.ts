import { Module } from '@nestjs/common';
import { AccountDeletionService } from './account-deletion.service.js';
import { AccountController } from './account.controller.js';

/** 서비스 내 탈퇴(FR-109). 파이프라인은 retention(장기 미이용)과 auth(고객센터 요청 처리)도 쓴다 */
@Module({
  controllers: [AccountController],
  providers: [AccountDeletionService],
  exports: [AccountDeletionService],
})
export class AccountModule {}
