import { Controller, Get, Req } from '@nestjs/common';
import {
  ApiCookieAuth,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';
import type { AdminCodefUsage } from '@yeojeong/shared';
import type { Request } from 'express';
import { ApiErrorResponse } from '../common/errors/index.js';
import { AdminAuditLog } from './admin-audit.js';
import { AdminCodefService } from './admin-codef.service.js';
import { ADMIN_COOKIE } from './admin.constants.js';
import { AdminOnly } from './admin.guard.js';
import { AdminCodefUsageDto } from './dto/admin-codef.dto.js';

@ApiTags('admin')
@ApiCookieAuth(ADMIN_COOKIE)
@AdminOnly()
@Controller('admin')
export class AdminCodefController {
  constructor(
    private readonly codef: AdminCodefService,
    private readonly audit: AdminAuditLog,
  ) {}

  @ApiOperation({
    summary: 'CODEF 호출 현황',
    description:
      '오늘 호출·예산·예약·남은 수, 최근 14일, 결과 코드별·카드사별 집계, 사용자별 오늘 횟수 상위, 쿨다운·삭제 대기, 기능 플래그. 읽기 전용. 접근 기록 ADMIN_VIEW_CODEF_USAGE',
  })
  @ApiOkResponse({ type: AdminCodefUsageDto })
  @ApiErrorResponse(401, 'ADMIN_UNAUTHENTICATED')
  @Get('codef-usage')
  async usage(@Req() req: Request): Promise<AdminCodefUsage> {
    const usage = await this.codef.usage();
    await this.audit.record(req, 'ADMIN_VIEW_CODEF_USAGE', {
      resourceType: 'CODEF_USAGE',
    });
    return usage;
  }
}
