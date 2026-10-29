import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  Patch,
  Post,
  Query,
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
  WalletEntryListResponse,
  WalletEntryMutationResponse,
  WalletTripCandidatesResponse,
} from '@yeojeong/shared';
import { Audited, fromCurrentUser } from '../audit/index.js';
import { CurrentUser, type AuthUser } from '../common/auth/index.js';
import { ApiErrorResponse } from '../common/errors/index.js';
import {
  CreateWalletEntryDto,
  DeleteWalletEntryQueryDto,
  ListWalletEntriesQueryDto,
  TripCandidatesQueryDto,
  UpdateWalletEntryDto,
  WalletEntryListResponseDto,
  WalletEntryMutationResponseDto,
  WalletTripCandidatesResponseDto,
} from './dto/wallet.dto.js';
import { WalletService } from './wallet.service.js';

/** 내 지갑(S7). 본인 것만 다룬다(userId 조건). 남의 항목·없는 항목은 404 */
@ApiTags('wallet')
@ApiErrorResponse(401, 'UNAUTHENTICATED')
@Controller('wallet')
export class WalletController {
  constructor(private readonly wallet: WalletService) {}

  @ApiOperation({
    summary: '지갑 항목 목록',
    description:
      '직접 입력 + 계좌·카드에서 가져온 거래, 최신순. 연결된 여정 결제 요약(linkedTrip)을 함께 준다. ' +
      '이번 달(KST) 합계 monthTotalKrw·monthTotalEstimated는 커서와 무관한 전체 기준으로 모든 페이지에 같은 값을 준다.',
  })
  @ApiOkResponse({ type: WalletEntryListResponseDto })
  @ApiErrorResponse(400, 'VALIDATION_FAILED')
  @Audited('LIST_WALLET_ENTRIES', {
    resourceType: 'USER',
    resourceId: fromCurrentUser,
  })
  @Get('entries')
  list(
    @CurrentUser() user: AuthUser,
    @Query() query: ListWalletEntriesQueryDto,
  ): Promise<WalletEntryListResponse> {
    return this.wallet.list(user.id, query);
  }

  @ApiOperation({
    summary: '지갑 항목을 연결할 여정 후보',
    description:
      '내가 활성 멤버인 예정·진행 중 여정. 정렬: 기간 안 → 진행 중 → 시작일이 at에 가까운 순. ' +
      'suggestedTripId(= items[0].inPeriod일 때 items[0])가 자동 연결 대상, 화면 문구 "○○ 여정에도 추가돼요". ' +
      'defaultCurrency = 진행 중 여정의 통화, 없으면 KRW.',
  })
  @ApiOkResponse({ type: WalletTripCandidatesResponseDto })
  @ApiErrorResponse(400, 'VALIDATION_FAILED')
  @Get('trip-candidates')
  candidates(
    @CurrentUser() user: AuthUser,
    @Query() query: TripCandidatesQueryDto,
  ): Promise<WalletTripCandidatesResponse> {
    return this.wallet.tripCandidates(
      user.id,
      query.at ? new Date(query.at) : new Date(),
    );
  }

  @ApiOperation({
    summary: '지갑에 결제 직접 추가',
    description:
      '필수는 amount뿐. tripId 생략 = 자동 연결(기간 안 예정·진행 중 여정에 미확정으로), uuid = 그 여정(기간 밖이면 여정 전/후), null = 지갑에만. ' +
      '연결된 결제는 가져온 결제와 같은 미확정이라 기존 분류(PUT classification)로 개인/공동을 정한다. clientRequestId가 같으면 처음 결과를 돌려준다.',
  })
  @ApiCreatedResponse({ type: WalletEntryMutationResponseDto })
  @ApiErrorResponse(400, 'VALIDATION_FAILED')
  @ApiErrorResponse(503, 'FX_RATE_UNAVAILABLE')
  @Post('entries')
  create(
    @CurrentUser() user: AuthUser,
    @Body() body: CreateWalletEntryDto,
  ): Promise<WalletEntryMutationResponse> {
    return this.wallet.create(user.id, body);
  }

  @ApiOperation({
    summary: '지갑 항목 수정(직접 입력만)',
    description:
      '보낸 필드만 바꾼다. 연결된 여정 결제에도 반영한다(공동이면 부담 재계산·"변경됨"·version 증가). ' +
      '종료된(또는 나간) 여정에 연결된 항목은 memo만 바꿀 수 있고, 그때 여정 장부는 바꾸지 않는다.',
  })
  @ApiParam({ name: 'entryId', format: 'uuid' })
  @ApiOkResponse({ type: WalletEntryMutationResponseDto })
  @ApiErrorResponse(400, 'VALIDATION_FAILED')
  @ApiErrorResponse(404, 'NOT_FOUND')
  @ApiErrorResponse(
    409,
    'NOT_MANUAL_ENTRY',
    'EXPENSE_LOCKED',
    'VERSION_CONFLICT',
  )
  @ApiErrorResponse(503, 'FX_RATE_UNAVAILABLE')
  @Patch('entries/:entryId')
  update(
    @CurrentUser() user: AuthUser,
    @Param('entryId') entryId: string,
    @Body() body: UpdateWalletEntryDto,
  ): Promise<WalletEntryMutationResponse> {
    return this.wallet.update(user.id, entryId, body);
  }

  @ApiOperation({
    summary: '지갑 항목 삭제(직접 입력만)',
    description:
      '연결된 미확정·개인 결제는 같이 지운다. 연결된 공동 결제는 예정·진행 중 여정이면 includeShared=true일 때만 같이 지운다(없으면 409). ' +
      '종료된(또는 나간) 여정의 공동 결제는 남기고 지갑 항목만 지운다(여정 결제의 지갑 연결만 끊긴다).',
  })
  @ApiParam({ name: 'entryId', format: 'uuid' })
  @ApiNoContentResponse({ description: '지웠다' })
  @ApiErrorResponse(404, 'NOT_FOUND')
  @ApiErrorResponse(409, 'NOT_MANUAL_ENTRY', 'SHARED_DELETE_CONFIRM_REQUIRED')
  @HttpCode(204)
  @Delete('entries/:entryId')
  async remove(
    @CurrentUser() user: AuthUser,
    @Param('entryId') entryId: string,
    @Query() query: DeleteWalletEntryQueryDto,
  ): Promise<void> {
    await this.wallet.remove(user.id, entryId, query.includeShared === true);
  }
}
