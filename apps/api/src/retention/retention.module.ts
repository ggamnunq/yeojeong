import { Module } from '@nestjs/common';
import { AccountModule } from '../account/account.module.js';
import { PurgeService } from './purge.service.js';
import { RetentionController } from './retention.controller.js';

/** 보존 기간이 지난 데이터의 파기 배치. 장기 미이용 회원은 AccountModule의 탈퇴 파이프라인을 쓴다 */
@Module({
  imports: [AccountModule],
  controllers: [RetentionController],
  providers: [PurgeService],
})
export class RetentionModule {}
