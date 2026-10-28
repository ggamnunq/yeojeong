import { Controller, HttpCode, Post, UseGuards } from '@nestjs/common';
import {
  ApiExcludeController,
  ApiOkResponse,
  ApiOperation,
} from '@nestjs/swagger';
import type { AutoEndJobResponse } from '@yeojeong/shared';
import { Public } from '../common/auth/index.js';
import { AutoEndJobResponseDto } from './dto/trip-response.dto.js';
import { InternalJobGuard } from './internal-job.guard.js';
import { TripEndService } from './trip-end.service.js';

/** Cloud Scheduler(1분 주기 제안) → 자동 종료(FR-305). 헤더 x-internal-job-secret 필요 */
@ApiExcludeController()
@Public()
@UseGuards(InternalJobGuard)
@Controller('internal/jobs')
export class AutoEndJobController {
  constructor(private readonly ending: TripEndService) {}

  @ApiOperation({ summary: '자동 종료 잡' })
  @ApiOkResponse({ type: AutoEndJobResponseDto })
  @HttpCode(200)
  @Post('auto-end')
  run(): Promise<AutoEndJobResponse> {
    return this.ending.runAutoEnd();
  }
}
