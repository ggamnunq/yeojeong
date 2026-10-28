import { Body, Controller, HttpCode, Post, UseGuards } from '@nestjs/common';
import { ApiExcludeController } from '@nestjs/swagger';
import type { PurgeJobResult } from '@yeojeong/shared';
import { Public } from '../common/auth/index.js';
import { PurgeJobDto } from './dto/purge-job.dto.js';
import { InternalJobGuard } from './internal-job.guard.js';
import { PurgeService } from './purge.service.js';

/** 내부 잡. 화면이 부르지 않으므로 Swagger에서 뺀다. 호출 방법은 src/retention/README.md */
@ApiExcludeController()
@Public()
@UseGuards(InternalJobGuard)
@Controller('internal/jobs')
export class RetentionController {
  constructor(private readonly purge: PurgeService) {}

  /** 파기 배치(기능명세 8-8). 매일 03:00 KST(제안) */
  @HttpCode(200)
  @Post('purge')
  run(@Body() body: PurgeJobDto): Promise<PurgeJobResult> {
    return this.purge.run({ dryRun: body.dryRun ?? false });
  }
}
