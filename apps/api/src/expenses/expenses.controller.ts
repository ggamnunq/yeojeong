import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  Patch,
  Post,
  Put,
  Query,
  Res,
  UseGuards,
} from '@nestjs/common';
import {
  ApiCreatedResponse,
  ApiNoContentResponse,
  ApiOkResponse,
  ApiOperation,
  ApiParam,
  ApiTags,
} from '@nestjs/swagger';
import type {
  AddOutOfPeriodExpensesResponse,
  ExpenseDetailResponse,
  ExpenseListResponse,
  OutOfPeriodCandidate,
} from '@yeojeong/shared';
import type { Response } from 'express';
import {
  CurrentMembership,
  RequireTripStatus,
  type MembershipContext,
} from '../common/auth/index.js';
import { Audited, fromParam } from '../audit/index.js';
import { ApiErrorResponse } from '../common/errors/index.js';
import { AccountLinkGuard } from '../common/features.js';
import {
  AddOutOfPeriodExpensesDto,
  ClassifyExpenseDto,
  DismissDuplicateDto,
  ListExpensesQueryDto,
  OutOfPeriodCandidatesQueryDto,
} from './dto/expense-request.dto.js';
import {
  AddOutOfPeriodExpensesResponseDto,
  ExpenseDetailResponseDto,
  ExpenseListResponseDto,
  OutOfPeriodCandidateDto,
} from './dto/expense-response.dto.js';
import {
  CreateTripExpenseDto,
  DeleteTripExpenseQueryDto,
  UpdateTripExpenseDto,
} from './dto/manual-request.dto.js';
import { ExpenseCommandService } from './expense-command.service.js';
import { ExpenseQueryService } from './expense-query.service.js';
import { ManualExpenseService } from './manual-expense.service.js';
import { OutOfPeriodService } from './out-of-period.service.js';

// :tripId 라우트라 MembershipGuard가 활성 멤버만 통과시킨다(아니면 404). 결제는 서비스에서 tripId 조건을 함께 건다.
@ApiTags('expenses')
@ApiParam({ name: 'tripId', format: 'uuid' })
@ApiErrorResponse(401, 'UNAUTHENTICATED')
@ApiErrorResponse(404, 'NOT_FOUND')
@Controller('trips/:tripId')
export class ExpensesController {
  constructor(
    private readonly query: ExpenseQueryService,
    private readonly command: ExpenseCommandService,
    private readonly outOfPeriod: OutOfPeriodService,
    private readonly manual: ManualExpenseService,
  ) {}

  @ApiOperation({
    summary: '결제내역 리스트·타임라인 (FR-501·502·002)',
    description:
      '내 미확정 + 내 개인 + 전원의 공동. 취소 자식은 부모 refunds[]로만. 리스트는 order=desc(기본), 타임라인은 day=N&order=asc. 확인 필요는 status=PENDING. 예정 여정은 직접 추가한 결제만 있다(S7).',
  })
  @ApiOkResponse({ type: ExpenseListResponseDto })
  @ApiErrorResponse(400, 'VALIDATION_FAILED')
  @Audited('LIST_EXPENSES', {
    resourceType: 'TRIP',
    resourceId: fromParam('tripId'),
  })
  @Get('expenses')
  list(
    @Param('tripId') tripId: string,
    @CurrentMembership() me: MembershipContext,
    @Query() query: ListExpensesQueryDto,
  ): Promise<ExpenseListResponse> {
    return this.query.list(tripId, me.id, query);
  }

  @ApiOperation({
    summary: '결제 상세 (FR-503)',
    description:
      '남의 미확정·개인은 404. permissions.canEdit/reason으로 시트 모드(EDIT_* / READ_ONLY / LOCKED)를 정한다.',
  })
  @ApiParam({ name: 'expenseId', format: 'uuid' })
  @ApiOkResponse({ type: ExpenseDetailResponseDto })
  @Audited('VIEW_EXPENSE_DETAIL', {
    resourceType: 'EXPENSE',
    resourceId: fromParam('expenseId'),
  })
  @Get('expenses/:expenseId')
  detail(
    @Param('tripId') tripId: string,
    @Param('expenseId') expenseId: string,
    @CurrentMembership() me: MembershipContext,
  ): Promise<ExpenseDetailResponse> {
    return this.query.detail(tripId, me.id, expenseId);
  }

  @ApiOperation({
    summary: '개인/공동 확정·공동↔개인 변경·부담 인원 변경 (FR-504~508)',
    description:
      '결제자(직접 입력한 결제는 작성자) · 진행 중만(직접 입력한 결제는 예정 여정도). 같은 상태·같은 부담 인원이면 변경 없이 200. 공동 → 개인은 confirmSharedToPersonal: true 필요. 결제수단 0개 규칙(CONSENT_REQUIRED·204)은 가져온 결제에만 건다.',
  })
  @ApiParam({ name: 'expenseId', format: 'uuid' })
  @ApiOkResponse({ type: ExpenseDetailResponseDto })
  @ApiErrorResponse(
    400,
    'VALIDATION_FAILED',
    'PARTICIPANTS_REQUIRED',
    'PARTICIPANT_NOT_MEMBER',
  )
  @ApiNoContentResponse({
    description:
      '결제자의 활성 결제수단이 0개(연동 동의 철회)일 때 공동 → 개인: 개인 결제로 남기지 않고 지웠다',
  })
  @ApiErrorResponse(403, 'NOT_PAYER', 'NOT_AUTHOR', 'CONSENT_REQUIRED')
  @ApiErrorResponse(
    409,
    'EXPENSE_LOCKED',
    'VERSION_CONFLICT',
    'SHARED_IN_OTHER_TRIP',
    'SHARED_TO_PERSONAL_CONFIRM_REQUIRED',
  )
  @Audited('CLASSIFY_EXPENSE', {
    resourceType: 'EXPENSE',
    resourceId: fromParam('expenseId'),
  })
  @RequireTripStatus(['UPCOMING', 'ONGOING'], { code: 'EXPENSE_LOCKED' })
  @Put('expenses/:expenseId/classification')
  async classify(
    @Param('tripId') tripId: string,
    @Param('expenseId') expenseId: string,
    @CurrentMembership() me: MembershipContext,
    @Body() body: ClassifyExpenseDto,
    @Res({ passthrough: true }) res: Response,
  ): Promise<ExpenseDetailResponse | undefined> {
    const result = await this.command.classify(tripId, me, expenseId, body);
    if (result === null) {
      // 결제자의 활성 결제수단이 0개라 공동 → 개인 대신 결제를 지웠다
      res.status(204);
      return undefined;
    }
    return result;
  }

  @ApiOperation({
    summary: '중복 의심 표시 해제 (FR-511)',
    description:
      '묶음 안 결제의 결제자(직접 입력한 결제는 작성자) · 진행 중(직접 입력한 결제는 예정 여정도). 묶음 전체가 해제되고 같은 쌍은 다시 표시하지 않는다.',
  })
  @ApiParam({ name: 'expenseId', format: 'uuid' })
  @ApiOkResponse({ type: ExpenseDetailResponseDto })
  @ApiErrorResponse(403, 'NOT_PAYER', 'NOT_AUTHOR')
  @ApiErrorResponse(
    409,
    'DUPLICATE_NOT_FLAGGED',
    'EXPENSE_LOCKED',
    'VERSION_CONFLICT',
  )
  @RequireTripStatus(['UPCOMING', 'ONGOING'], { code: 'EXPENSE_LOCKED' })
  @HttpCode(200)
  @Post('expenses/:expenseId/duplicate-dismissal')
  dismissDuplicate(
    @Param('tripId') tripId: string,
    @Param('expenseId') expenseId: string,
    @CurrentMembership() me: MembershipContext,
    @Body() body: DismissDuplicateDto,
  ): Promise<ExpenseDetailResponse> {
    return this.command.dismissDuplicate(tripId, me, expenseId, body.version);
  }

  @ApiOperation({
    summary: '기간 외 결제 후보 (FR-408)',
    description:
      '제공자에서 즉시 조회한 본인 승인 거래 중 여정 전 [시작 − 60일, 시작) / 여정 후 (자동 종료, 지금]. 응답만 하고 저장하지 않는다.',
  })
  @ApiOkResponse({ type: [OutOfPeriodCandidateDto] })
  @ApiErrorResponse(409, 'TRIP_PHASE_INVALID', 'CONNECTION_EXPIRED')
  @ApiErrorResponse(503, 'PROVIDER_UNAVAILABLE')
  @Audited('VIEW_CANDIDATES', {
    resourceType: 'TRIP',
    resourceId: fromParam('tripId'),
  })
  @RequireTripStatus('ONGOING')
  @UseGuards(AccountLinkGuard)
  @Get('out-of-period-candidates')
  candidates(
    @Param('tripId') tripId: string,
    @CurrentMembership() me: MembershipContext,
    @Query() query: OutOfPeriodCandidatesQueryDto,
  ): Promise<OutOfPeriodCandidate[]> {
    return this.outOfPeriod.candidates(tripId, me, query.side ?? 'BEFORE');
  }

  @ApiOperation({
    summary: '기간 외 결제 추가 (FR-408)',
    description:
      '고른 건마다 미확정(origin OUT_OF_PERIOD)으로 들어온다. 하나라도 추가할 수 없으면 아무것도 추가하지 않는다.',
  })
  @ApiCreatedResponse({ type: AddOutOfPeriodExpensesResponseDto })
  @ApiErrorResponse(400, 'VALIDATION_FAILED', 'OUT_OF_PERIOD_CANDIDATE_INVALID')
  @ApiErrorResponse(409, 'TRIP_PHASE_INVALID', 'CONNECTION_EXPIRED')
  @ApiErrorResponse(503, 'FX_RATE_UNAVAILABLE', 'PROVIDER_UNAVAILABLE')
  @RequireTripStatus('ONGOING')
  @UseGuards(AccountLinkGuard)
  @Post('out-of-period-expenses')
  addOutOfPeriod(
    @Param('tripId') tripId: string,
    @CurrentMembership() me: MembershipContext,
    @Body() body: AddOutOfPeriodExpensesDto,
  ): Promise<AddOutOfPeriodExpensesResponse> {
    return this.outOfPeriod.add(tripId, me, body.candidateIds);
  }

  @ApiOperation({
    summary: '여정에서 결제 직접 추가 (S7)',
    description:
      '예정·진행 중 여정만. 필수는 amount뿐(통화 기본 = 여정 통화, 시각 기본 = 지금, 결제자 기본 = 나, 분담 기본 = 활성 멤버 전원). ' +
      '분담에 결제자 말고 한 명이라도 있으면 공동, 결제자 혼자면 개인으로 바로 확정된다. 기간 밖 시각이면 여정 전/후 그룹(periodSide). ' +
      'addToWallet이면 내 지갑에도 같은 결제를 기록한다(결제자가 나일 때만). clientRequestId가 같으면 처음 결과를 그대로 돌려준다.',
  })
  @ApiCreatedResponse({ type: ExpenseDetailResponseDto })
  @ApiErrorResponse(
    400,
    'VALIDATION_FAILED',
    'PARTICIPANTS_REQUIRED',
    'PARTICIPANT_NOT_MEMBER',
  )
  @ApiErrorResponse(409, 'TRIP_PHASE_INVALID')
  @ApiErrorResponse(503, 'FX_RATE_UNAVAILABLE')
  @Audited('CREATE_EXPENSE', {
    resourceType: 'TRIP',
    resourceId: fromParam('tripId'),
  })
  @RequireTripStatus(['UPCOMING', 'ONGOING'])
  @Post('expenses')
  createManual(
    @Param('tripId') tripId: string,
    @CurrentMembership() me: MembershipContext,
    @Body() body: CreateTripExpenseDto,
  ): Promise<ExpenseDetailResponse> {
    return this.manual.createInTrip(tripId, me, body);
  }

  @ApiOperation({
    summary: '직접 입력한 결제 수정 (S7)',
    description:
      '작성자 · 예정·진행 중만. 보낸 필드만 바꾼다. 공동이었으면 "변경됨"이 붙고 부담이 다시 계산된다. ' +
      '지갑과 연결된 결제면 금액·통화·메모·시각이 지갑 항목에도 반영된다(결제자는 바꿀 수 없다).',
  })
  @ApiParam({ name: 'expenseId', format: 'uuid' })
  @ApiOkResponse({ type: ExpenseDetailResponseDto })
  @ApiErrorResponse(
    400,
    'VALIDATION_FAILED',
    'PARTICIPANTS_REQUIRED',
    'PARTICIPANT_NOT_MEMBER',
  )
  @ApiErrorResponse(403, 'NOT_AUTHOR')
  @ApiErrorResponse(
    409,
    'EXPENSE_LOCKED',
    'NOT_MANUAL_ENTRY',
    'VERSION_CONFLICT',
    'SHARED_TO_PERSONAL_CONFIRM_REQUIRED',
  )
  @ApiErrorResponse(503, 'FX_RATE_UNAVAILABLE')
  @Audited('EDIT_EXPENSE', {
    resourceType: 'EXPENSE',
    resourceId: fromParam('expenseId'),
  })
  @RequireTripStatus(['UPCOMING', 'ONGOING'], { code: 'EXPENSE_LOCKED' })
  @Patch('expenses/:expenseId')
  updateManual(
    @Param('tripId') tripId: string,
    @Param('expenseId') expenseId: string,
    @CurrentMembership() me: MembershipContext,
    @Body() body: UpdateTripExpenseDto,
  ): Promise<ExpenseDetailResponse> {
    return this.manual.update(tripId, me, expenseId, body);
  }

  @ApiOperation({
    summary: '직접 입력한 결제 삭제 (S7)',
    description:
      '작성자 · 예정·진행 중만. 공동 결제도 지울 수 있다(현황·정산 미리보기는 남은 결제로 다시 계산된다). ' +
      '지갑에 같은 결제가 있으면 지갑 항목은 남고 여정 연결만 끊긴다.',
  })
  @ApiParam({ name: 'expenseId', format: 'uuid' })
  @ApiNoContentResponse({ description: '지웠다' })
  @ApiErrorResponse(400, 'VALIDATION_FAILED')
  @ApiErrorResponse(403, 'NOT_AUTHOR')
  @ApiErrorResponse(
    409,
    'EXPENSE_LOCKED',
    'NOT_MANUAL_ENTRY',
    'VERSION_CONFLICT',
  )
  @RequireTripStatus(['UPCOMING', 'ONGOING'], { code: 'EXPENSE_LOCKED' })
  @HttpCode(204)
  @Delete('expenses/:expenseId')
  async removeManual(
    @Param('tripId') tripId: string,
    @Param('expenseId') expenseId: string,
    @CurrentMembership() me: MembershipContext,
    @Query() query: DeleteTripExpenseQueryDto,
  ): Promise<void> {
    await this.manual.remove(tripId, me, expenseId, query.version);
  }
}
