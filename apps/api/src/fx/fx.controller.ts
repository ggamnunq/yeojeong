import {
  Body,
  Controller,
  Get,
  HttpCode,
  Param,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import {
  ApiHeader,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';
import type {
  FxJobResult,
  FxRateView,
  TripFxView,
  UpdateFxPolicyResponse,
} from '@yeojeong/shared';
import {
  CurrentMembership,
  Public,
  RequireRole,
  RequireTripStatus,
  type MembershipContext,
} from '../common/auth/index.js';
import {
  ApiErrorResponse,
  ValidationFailedError,
} from '../common/errors/index.js';
import {
  FxJobResultDto,
  FxRateQueryDto,
  FxRateViewDto,
  TripFxViewDto,
  UpdateFxPolicyDto,
  UpdateFxPolicyResponseDto,
} from './dto/fx.dto.js';
import { FxJobService } from './fx-job.service.js';
import { FxPolicyService } from './fx-policy.service.js';
import { FxRatesService } from './fx-rates.service.js';
import {
  INTERNAL_JOB_SECRET_HEADER,
  InternalJobGuard,
} from './internal-job.guard.js';
import { asOfFromQuery } from './kst.js';

@ApiTags('fx')
@Controller()
export class FxController {
  constructor(
    private readonly rates: FxRatesService,
    private readonly policy: FxPolicyService,
  ) {}

  @ApiOperation({ summary: '통화 매매기준율 조회(FR-806)' })
  @ApiOkResponse({ type: FxRateViewDto })
  @ApiErrorResponse(400, 'VALIDATION_FAILED')
  @ApiErrorResponse(503, 'FX_RATE_UNAVAILABLE')
  @Get('fx')
  rate(@Query() query: FxRateQueryDto): Promise<FxRateView> {
    const at = query.date ? asOfFromQuery(query.date) : undefined;
    if (at === null) {
      throw new ValidationFailedError([
        { path: 'date', code: 'isDate', message: '날짜를 확인해 주세요' },
      ]);
    }
    return this.rates.getRate(query.base, at);
  }

  @ApiOperation({ summary: '여정 환율·적용 기준 조회(FR-806, WF-29)' })
  @ApiOkResponse({ type: TripFxViewDto })
  @ApiErrorResponse(404, 'NOT_FOUND')
  @Get('trips/:tripId/fx-policy')
  view(
    @Param('tripId') tripId: string,
    @CurrentMembership() me: MembershipContext,
  ): Promise<TripFxView> {
    return this.policy.getView(tripId, me);
  }

  @ApiOperation({
    summary: '환율 적용 기준 변경(FR-807·808). 그룹장, 시작 전·진행 중',
  })
  @ApiOkResponse({ type: UpdateFxPolicyResponseDto })
  @ApiErrorResponse(400, 'VALIDATION_FAILED', 'BAD_REQUEST')
  @ApiErrorResponse(403, 'NOT_LEADER')
  @ApiErrorResponse(404, 'NOT_FOUND')
  @ApiErrorResponse(409, 'FX_POLICY_LOCKED', 'VERSION_CONFLICT')
  @RequireRole('LEADER')
  @RequireTripStatus(['UPCOMING', 'ONGOING'], { code: 'FX_POLICY_LOCKED' })
  @Patch('trips/:tripId/fx-policy')
  update(
    @Param('tripId') tripId: string,
    @CurrentMembership() me: MembershipContext,
    @Body() body: UpdateFxPolicyDto,
  ): Promise<UpdateFxPolicyResponse> {
    return this.policy.update(tripId, me, body);
  }
}

@ApiTags('jobs')
@ApiHeader({ name: INTERNAL_JOB_SECRET_HEADER, required: true })
@Public()
@UseGuards(InternalJobGuard)
@Controller('internal/jobs')
export class FxJobController {
  constructor(private readonly job: FxJobService) {}

  @ApiOperation({ summary: '환율 수집 + 진행 중 외화 여정 재환산(내부 잡)' })
  @ApiOkResponse({ type: FxJobResultDto })
  @ApiErrorResponse(403, 'FORBIDDEN')
  @ApiErrorResponse(503, 'FX_RATE_UNAVAILABLE')
  @HttpCode(200)
  @Post('fx')
  collect(): Promise<FxJobResult> {
    return this.job.collect();
  }
}
