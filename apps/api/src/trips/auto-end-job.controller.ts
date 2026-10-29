import { Controller, HttpCode, Post } from '@nestjs/common';
import {
  ApiExcludeController,
  ApiOkResponse,
  ApiOperation,
} from '@nestjs/swagger';
import type { AutoEndJobResponse } from '@yeojeong/shared';
import { InternalJob } from '../common/internal-job/index.js';
import { AutoEndJobResponseDto } from './dto/trip-response.dto.js';
import { TripEndService } from './trip-end.service.js';

/** Cloud Scheduler(5분 주기) → 자동 종료(FR-305). */
@ApiExcludeController()
@InternalJob()
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
