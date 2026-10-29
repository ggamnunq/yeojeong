import { Controller, HttpCode, Post } from '@nestjs/common';
import { ApiExcludeController } from '@nestjs/swagger';
import type { ConsentIpBackfillResult } from '@yeojeong/shared';
import { InternalJob } from '../common/internal-job/index.js';
import { ConsentIpBackfillService } from './consent-ip-backfill.js';

/** 내부 잡. 화면이 부르지 않으므로 Swagger에서 뺀다. 운영 절차는 prisma/README.md "동의 기록 IP" */
@ApiExcludeController()
@InternalJob()
@Controller('internal/jobs')
export class ConsentIpBackfillController {
  constructor(private readonly backfill: ConsentIpBackfillService) {}

  /** 동의 기록 IP 평문을 HMAC으로 옮기고 평문을 지운다(멱등, 배치 단위) */
  @HttpCode(200)
  @Post('consent-ip-backfill')
  run(): Promise<ConsentIpBackfillResult> {
    return this.backfill.run();
  }
}
