import {
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  Post,
  Query,
  Res,
  UseGuards,
} from '@nestjs/common';
import {
  ApiAcceptedResponse,
  ApiNoContentResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';
import type {
  ManualSyncResponse,
  PaymentMethodsResponse,
} from '@yeojeong/shared';
import type { Response } from 'express';
import { CurrentUser, type AuthUser } from '../common/auth/index.js';
import { ApiErrorResponse, NotFoundError } from '../common/errors/index.js';
import { AccountLinkGuard, FeatureFlags } from '../common/features.js';
import {
  ManualSyncResponseDto,
  PaymentMethodsResponseDto,
  RemovePaymentMethodQueryDto,
} from './dto/payment-methods.dto.js';
import { PaymentMethodsService } from './payment-methods.service.js';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

@ApiTags('payment-methods')
@Controller('payment-methods')
export class PaymentMethodsController {
  constructor(
    private readonly methods: PaymentMethodsService,
    private readonly features: FeatureFlags,
  ) {}

  @ApiOperation({ summary: '연결된 계좌·카드와 동기화 시각(FR-803)' })
  @ApiOkResponse({ type: PaymentMethodsResponseDto })
  @Get()
  list(@CurrentUser() user: AuthUser): Promise<PaymentMethodsResponse> {
    // 계좌·카드 연결을 숨긴 동안(FR-006)은 빈 목록
    if (!this.features.accountLink) {
      return Promise.resolve({
        connections: [],
        methods: [],
        lastSyncedAt: null,
        hasExpiredConnection: false,
        counts: { accounts: 0, cards: 0 },
      });
    }
    return this.methods.list(user.id);
  }

  @ApiOperation({
    summary: '수동 동기화(FR-402). 사용자당 60초에 1번',
    description:
      '동기화를 시작하면 202. 진행 중 여정이 없어 제공자를 부르지 않으면 200 + skipped: NO_ACTIVE_TRIP(동기화 시각은 그대로)',
  })
  @ApiAcceptedResponse({ type: ManualSyncResponseDto })
  @ApiOkResponse({
    type: ManualSyncResponseDto,
    description: 'skipped: NO_ACTIVE_TRIP',
  })
  @ApiErrorResponse(429, 'SYNC_RATE_LIMITED')
  @ApiErrorResponse(409, 'CONNECTION_EXPIRED')
  @UseGuards(AccountLinkGuard)
  @HttpCode(202)
  @Post('sync')
  async sync(
    @CurrentUser() user: AuthUser,
    @Res({ passthrough: true }) res: Response,
  ): Promise<ManualSyncResponse> {
    const result = await this.methods.manualSync(user.id);
    if (result.skipped) res.status(200);
    return result;
  }

  @ApiOperation({
    summary: '결제수단 연결 해제(FR-804)',
    description:
      '이미 들어온 결제는 그대로. 연결의 마지막 결제수단이면 연결 REVOKED + 연동 동의 철회, purgeImported=true면 내 미확정·개인 결제와 거래 원본도 지운다',
  })
  @ApiNoContentResponse()
  @ApiErrorResponse(404, 'NOT_FOUND')
  @ApiErrorResponse(400, 'BAD_REQUEST', 'VALIDATION_FAILED')
  @UseGuards(AccountLinkGuard)
  @HttpCode(204)
  @Delete(':paymentMethodId')
  async remove(
    @CurrentUser() user: AuthUser,
    @Param('paymentMethodId') paymentMethodId: string,
    @Query() query: RemovePaymentMethodQueryDto,
  ): Promise<void> {
    if (!UUID.test(paymentMethodId)) throw new NotFoundError();
    await this.methods.remove(
      user.id,
      paymentMethodId,
      query.purgeImported === 'true',
    );
  }
}
