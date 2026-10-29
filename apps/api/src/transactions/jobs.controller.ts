import { Controller, HttpCode, Post, UseGuards } from '@nestjs/common';
import {
  ApiHeader,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';
import type { SyncJobResult } from '@yeojeong/shared';
import { Public } from '../common/auth/index.js';
import { ApiErrorResponse } from '../common/errors/index.js';
import { SyncJobResultDto } from './dto/sync-job-result.dto.js';
import {
  INTERNAL_JOB_SECRET_HEADER,
  InternalJobGuard,
} from './internal-job.guard.js';
import { SyncService } from './sync.service.js';

@ApiTags('internal')
@Public()
@UseGuards(InternalJobGuard)
@Controller('internal/jobs')
export class JobsController {
  constructor(private readonly sync: SyncService) {}

  @ApiOperation({
    summary: '주기 동기화(10분, Cloud Scheduler)',
    description:
      '진행 중 여정이 있는 사용자의 ACTIVE 연결마다 동기화한다. 소급이 덜 된 여정이 있으면 그 startAt부터 다시 가져온다(자가 복구).',
  })
  @ApiHeader({ name: INTERNAL_JOB_SECRET_HEADER, required: true })
  @ApiOkResponse({ type: SyncJobResultDto })
  @ApiErrorResponse(403, 'FORBIDDEN', 'CSRF_REJECTED')
  @HttpCode(200)
  @Post('sync')
  runSync(): Promise<SyncJobResult> {
    return this.sync.runScheduled();
  }
}
