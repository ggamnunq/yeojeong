import {
  Body,
  Controller,
  Get,
  HttpCode,
  Param,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import { ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import type {
  FxJobResult,
  FxRateView,
  FxSpotSeriesResponse,
  TripFxView,
  UpdateFxPolicyResponse,
} from '@yeojeong/shared';
import {
  CurrentMembership,
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
  FxSpotSeriesQueryDto,
  FxSpotSeriesResponseDto,
  TripFxViewDto,
  UpdateFxPolicyDto,
  UpdateFxPolicyResponseDto,
} from './dto/fx.dto.js';
import { FxJobService } from './fx-job.service.js';
import { FxPolicyService } from './fx-policy.service.js';
import { FxRatesService } from './fx-rates.service.js';
import { InternalJob } from '../common/internal-job/index.js';
import { asOfFromQuery, daysBetween, toKstIso } from './kst.js';

/** spot-series 최대 기간(일). 위챗 내역은 최대 1년 */
const SPOT_SERIES_MAX_DAYS = 400;

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

  @ApiOperation({
    summary: '기간의 매매기준율 고시(결제 시각 기준 추정용)',
    description:
      '[from, to](KST 날짜) 안의 고시와 그 직전 고시 1건, 시각 오름차순. 화면이 여러 결제의 "약 ₩"을 결제 시각 기준으로 한 번에 계산한다(W10 — 결제 시각은 보내지 않는다). 최대 400일.',
  })
  @ApiOkResponse({ type: FxSpotSeriesResponseDto })
  @ApiErrorResponse(400, 'VALIDATION_FAILED')
  @Get('fx/spot-series')
  async spotSeries(
    @Query() query: FxSpotSeriesQueryDto,
  ): Promise<FxSpotSeriesResponse> {
    const from = asOfFromQuery(query.from);
    const to = asOfFromQuery(query.to);
    const days = daysBetween(query.from, query.to);
    if (!from || !to || days < 0 || days >= SPOT_SERIES_MAX_DAYS) {
      throw new ValidationFailedError([
        { path: 'to', code: 'range', message: '기간을 확인해 주세요' },
      ]);
    }
    // from은 그날 00:00 KST부터(asOfFromQuery는 그날 끝을 준다)
    const start = new Date(Date.parse(`${query.from}T00:00:00+09:00`));
    const table = await this.rates.loadSpotSeries(query.base, start, to);
    return {
      currency: query.base,
      rates: table.map((r) => ({
        rate: r.rate,
        effectiveAt: toKstIso(r.effectiveAt),
      })),
    };
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
@InternalJob()
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
