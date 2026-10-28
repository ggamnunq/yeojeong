import {
  Body,
  Controller,
  Get,
  HttpCode,
  Param,
  Patch,
  Post,
} from '@nestjs/common';
import {
  ApiCreatedResponse,
  ApiNoContentResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';
import type {
  CreateTripResponse,
  EndPreviewResponse,
  EndTripResponse,
  MyTripsResponse,
  TripDetailResponse,
} from '@yeojeong/shared';
import {
  CurrentMembership,
  CurrentUser,
  RequireRole,
  RequireTripStatus,
  type AuthUser,
  type MembershipContext,
} from '../common/auth/index.js';
import { ApiErrorResponse } from '../common/errors/index.js';
import {
  AckTripEventsDto,
  CreateTripDto,
  TripVersionDto,
  UpdateTripDto,
} from './dto/trip-request.dto.js';
import {
  CreateTripResponseDto,
  EndPreviewResponseDto,
  EndTripResponseDto,
  MyTripsResponseDto,
  TripDetailResponseDto,
} from './dto/trip-response.dto.js';
import { TripEndService } from './trip-end.service.js';
import { TripsService } from './trips.service.js';

@ApiTags('trips')
@Controller('trips')
export class TripsController {
  constructor(
    private readonly trips: TripsService,
    private readonly ending: TripEndService,
  ) {}

  @ApiOperation({
    summary: '여정 만들기(그룹 + 여정 + 그룹장)',
    description: 'FR-201',
  })
  @ApiCreatedResponse({ type: CreateTripResponseDto })
  @ApiErrorResponse(400, 'VALIDATION_FAILED')
  @Post()
  create(
    @CurrentUser() user: AuthUser,
    @Body() dto: CreateTripDto,
  ): Promise<CreateTripResponse> {
    return this.trips.create(user, dto);
  }

  @ApiOperation({
    summary: '여정 상세(셸·권한·그룹원·초대코드·1회성 이벤트)',
    description: 'FR-001·301. lastViewedTripId를 이 여정으로 바꾼다',
  })
  @ApiOkResponse({ type: TripDetailResponseDto })
  @ApiErrorResponse(404, 'NOT_FOUND')
  @Get(':tripId')
  detail(
    @Param('tripId') tripId: string,
    @CurrentMembership() me: MembershipContext,
  ): Promise<TripDetailResponse> {
    return this.trips.detailForViewer(tripId, me);
  }

  @ApiOperation({
    summary: '여정 정보 수정',
    description:
      'FR-302. 시작 전 전 항목, 진행 중 그룹명·예산·종료일(오늘 이후)',
  })
  @ApiOkResponse({ type: TripDetailResponseDto })
  @ApiErrorResponse(400, 'VALIDATION_FAILED')
  @ApiErrorResponse(403, 'NOT_LEADER')
  @ApiErrorResponse(409, 'TRIP_PHASE_INVALID', 'VERSION_CONFLICT')
  @RequireRole('LEADER')
  @RequireTripStatus(['UPCOMING', 'ONGOING'])
  @Patch(':tripId')
  update(
    @Param('tripId') tripId: string,
    @CurrentMembership() me: MembershipContext,
    @Body() dto: UpdateTripDto,
  ): Promise<TripDetailResponse> {
    return this.trips.update(tripId, me, dto);
  }

  @ApiOperation({ summary: '여정 시작', description: 'FR-303' })
  @ApiOkResponse({ type: TripDetailResponseDto })
  @ApiErrorResponse(403, 'NOT_LEADER')
  @ApiErrorResponse(409, 'TRIP_PHASE_INVALID', 'VERSION_CONFLICT')
  @RequireRole('LEADER')
  @RequireTripStatus('UPCOMING')
  @HttpCode(200)
  @Post(':tripId/start')
  start(
    @Param('tripId') tripId: string,
    @CurrentMembership() me: MembershipContext,
    @Body() dto: TripVersionDto,
  ): Promise<TripDetailResponse> {
    return this.trips.start(tripId, me, dto.version);
  }

  @ApiOperation({
    summary: '종료 미리보기(미확정 건수)',
    description: 'FR-304',
  })
  @ApiOkResponse({ type: EndPreviewResponseDto })
  @ApiErrorResponse(403, 'NOT_LEADER')
  @ApiErrorResponse(409, 'TRIP_PHASE_INVALID')
  @RequireRole('LEADER')
  @RequireTripStatus('ONGOING')
  @Get(':tripId/end-preview')
  endPreview(@Param('tripId') tripId: string): Promise<EndPreviewResponse> {
    return this.ending.preview(tripId);
  }

  @ApiOperation({ summary: '여정 수동 종료', description: 'FR-304·306' })
  @ApiOkResponse({ type: EndTripResponseDto })
  @ApiErrorResponse(403, 'NOT_LEADER')
  @ApiErrorResponse(409, 'TRIP_PHASE_INVALID', 'VERSION_CONFLICT')
  @RequireRole('LEADER')
  @RequireTripStatus('ONGOING')
  @HttpCode(200)
  @Post(':tripId/end')
  end(
    @Param('tripId') tripId: string,
    @CurrentMembership() me: MembershipContext,
    @Body() dto: TripVersionDto,
  ): Promise<EndTripResponse> {
    return this.ending.endManually(tripId, me, dto.version);
  }

  @ApiOperation({ summary: '1회성 이벤트 확인', description: 'FR-004' })
  @ApiNoContentResponse()
  @ApiErrorResponse(404, 'NOT_FOUND')
  @HttpCode(204)
  @Post(':tripId/events/ack')
  async ackEvents(
    @Param('tripId') tripId: string,
    @CurrentMembership() me: MembershipContext,
    @Body() dto: AckTripEventsDto,
  ): Promise<void> {
    await this.trips.ackEvents(tripId, me, dto.lastEventId);
  }
}

@ApiTags('trips')
@Controller('me')
export class MyTripsController {
  constructor(private readonly trips: TripsService) {}

  @ApiOperation({ summary: '내 여정 목록', description: 'FR-102·205' })
  @ApiOkResponse({ type: MyTripsResponseDto })
  @Get('trips')
  list(@CurrentUser() user: AuthUser): Promise<MyTripsResponse> {
    return this.trips.listMine(user.id);
  }
}
