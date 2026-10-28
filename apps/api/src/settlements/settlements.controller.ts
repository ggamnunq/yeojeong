import {
  Body,
  Controller,
  Get,
  HttpCode,
  Param,
  ParseUUIDPipe,
  Post,
  UseGuards,
} from '@nestjs/common';
import {
  ApiHeader,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';
import type {
  SettlementMemberExpenses,
  SettlementRecomputeResult,
  SettlementSweepResult,
  SettlementView,
  TripSummary,
} from '@yeojeong/shared';
import {
  CurrentMembership,
  Public,
  RequireRole,
  RequireTripStatus,
  type MembershipContext,
} from '../common/auth/index.js';
import { ApiErrorResponse, NotFoundError } from '../common/errors/index.js';
import {
  INTERNAL_JOB_SECRET_HEADER,
  InternalJobGuard,
} from '../fx/internal-job.guard.js';
import {
  RecomputeSettlementDto,
  SettlementMemberExpensesDto,
  SettlementRecomputeResultDto,
  SettlementSweepResultDto,
  SettlementViewDto,
  TripSummaryDto,
} from './dto/settlement.dto.js';
import { SettlementSnapshotService } from './settlement-snapshot.service.js';
import { SettlementsService } from './settlements.service.js';
import { SummaryService } from './summary.service.js';

const membershipIdPipe = new ParseUUIDPipe({
  exceptionFactory: () => new NotFoundError(),
});

@ApiTags('settlements')
@Controller('trips/:tripId')
export class SettlementsController {
  constructor(
    private readonly summary: SummaryService,
    private readonly settlements: SettlementsService,
    private readonly snapshots: SettlementSnapshotService,
  ) {}

  @ApiOperation({
    summary:
      '현황: 내가 낼 금액·공동 지출·예산·내 지출·멤버별 부담(FR-601~604)',
  })
  @ApiOkResponse({ type: TripSummaryDto })
  @ApiErrorResponse(404, 'NOT_FOUND')
  @ApiErrorResponse(409, 'TRIP_PHASE_INVALID')
  @RequireTripStatus(['ONGOING', 'ENDED'])
  @Get('summary')
  getSummary(
    @Param('tripId') tripId: string,
    @CurrentMembership() me: MembershipContext,
  ): Promise<TripSummary> {
    return this.summary.getSummary(tripId, me);
  }

  @ApiOperation({
    summary: '정산 요약 + 송금 권장안(FR-702·704·705). 없으면 지연 생성',
  })
  @ApiOkResponse({ type: SettlementViewDto })
  @ApiErrorResponse(404, 'NOT_FOUND')
  @ApiErrorResponse(409, 'TRIP_PHASE_INVALID')
  @RequireTripStatus('ENDED')
  @Get('settlement')
  getSettlement(
    @Param('tripId') tripId: string,
    @CurrentMembership() me: MembershipContext,
  ): Promise<SettlementView> {
    return this.settlements.getView(tripId, me);
  }

  @ApiOperation({
    summary: '멤버별 결제 내역(FR-703). 남의 개인 결제는 건수만',
  })
  @ApiOkResponse({ type: SettlementMemberExpensesDto })
  @ApiErrorResponse(404, 'NOT_FOUND')
  @ApiErrorResponse(409, 'TRIP_PHASE_INVALID')
  @RequireTripStatus('ENDED')
  @Get('settlement/members/:membershipId/expenses')
  getMemberExpenses(
    @Param('tripId') tripId: string,
    @Param('membershipId', membershipIdPipe) membershipId: string,
    @CurrentMembership() me: MembershipContext,
  ): Promise<SettlementMemberExpenses> {
    return this.settlements.getMemberExpenses(tripId, me, membershipId);
  }

  @ApiOperation({
    summary: '정산 다시 계산(그룹장). 기존 스냅샷을 지우고 다시 만든다',
  })
  @ApiOkResponse({ type: SettlementViewDto })
  @ApiErrorResponse(403, 'NOT_LEADER')
  @ApiErrorResponse(404, 'NOT_FOUND')
  @ApiErrorResponse(409, 'TRIP_PHASE_INVALID')
  @RequireRole('LEADER')
  @RequireTripStatus('ENDED')
  @HttpCode(200)
  @Post('settlement/recompute')
  async recompute(
    @Param('tripId') tripId: string,
    @CurrentMembership() me: MembershipContext,
  ): Promise<SettlementView> {
    await this.snapshots.recompute(tripId);
    return this.settlements.getView(tripId, me);
  }
}

@ApiTags('jobs')
@ApiHeader({ name: INTERNAL_JOB_SECRET_HEADER, required: true })
@Public()
@UseGuards(InternalJobGuard)
@Controller('internal/jobs/settlements')
export class SettlementJobsController {
  constructor(private readonly snapshots: SettlementSnapshotService) {}

  @ApiOperation({ summary: '종료됐는데 정산이 없는 여정 복구(내부 잡)' })
  @ApiOkResponse({ type: SettlementSweepResultDto })
  @ApiErrorResponse(403, 'FORBIDDEN')
  @HttpCode(200)
  @Post()
  sweep(): Promise<SettlementSweepResult> {
    return this.snapshots.sweepMissing();
  }

  @ApiOperation({ summary: '정산 다시 계산(내부 잡)' })
  @ApiOkResponse({ type: SettlementRecomputeResultDto })
  @ApiErrorResponse(403, 'FORBIDDEN')
  @ApiErrorResponse(404, 'NOT_FOUND')
  @ApiErrorResponse(409, 'TRIP_PHASE_INVALID')
  @HttpCode(200)
  @Post('recompute')
  recompute(
    @Body() body: RecomputeSettlementDto,
  ): Promise<SettlementRecomputeResult> {
    return this.snapshots.recompute(body.tripId);
  }
}
