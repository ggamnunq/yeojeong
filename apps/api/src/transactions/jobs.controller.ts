import { Controller, HttpCode, Post } from '@nestjs/common';
import {
  ApiExcludeController,
  ApiOkResponse,
  ApiOperation,
} from '@nestjs/swagger';
import type { SyncJobResult } from '@yeojeong/shared';
import { InternalJob } from '../common/internal-job/index.js';
import { SyncJobResultDto } from './dto/sync-job-result.dto.js';
import { SyncService } from './sync.service.js';

/** Cloud Scheduler(10분 주기) → 주기 동기화. 인증은 전역 InternalJobGuard(OIDC). */
@ApiExcludeController()
@InternalJob()
@Controller('internal/jobs')
export class JobsController {
  constructor(private readonly sync: SyncService) {}

  @ApiOperation({
    summary: '주기 동기화(10분, Cloud Scheduler)',
    description:
      '진행 중 여정이 있는 사용자의 ACTIVE 연결마다 동기화한다. 소급이 덜 된 여정이 있으면 그 startAt부터 다시 가져온다(자가 복구).',
  })
  @ApiOkResponse({ type: SyncJobResultDto })
  @HttpCode(200)
  @Post('sync')
  runSync(): Promise<SyncJobResult> {
    return this.sync.runScheduled();
  }
}
