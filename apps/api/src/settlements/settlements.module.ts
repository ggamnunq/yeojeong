import { Module } from '@nestjs/common';
import { FxModule } from '../fx/fx.module.js';
import { SettlementSnapshotService } from './settlement-snapshot.service.js';
import {
  SettlementJobsController,
  SettlementsController,
} from './settlements.controller.js';
import { SettlementsService } from './settlements.service.js';
import { SummaryService } from './summary.service.js';

/**
 * 현황 지표, 종료 정산 스냅샷, 송금 권장안(기능명세 1-2 settlements). 사용법은 README.md.
 * trips 모듈은 SettlementSnapshotService(preview·ensureSettlement)와 compute.ts의 computeSettlement를 쓴다.
 */
@Module({
  imports: [FxModule],
  controllers: [SettlementsController, SettlementJobsController],
  providers: [SettlementSnapshotService, SettlementsService, SummaryService],
  exports: [SettlementSnapshotService],
})
export class SettlementsModule {}
