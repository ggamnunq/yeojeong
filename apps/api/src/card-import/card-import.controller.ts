import {
  Body,
  Controller,
  Get,
  HttpCode,
  Post,
  UseGuards,
} from '@nestjs/common';
import { ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import {
  CARD_IMPORT_REQUIRED_CONSENTS,
  type CardImportConfig,
  type FetchCardApprovalsResponse,
} from '@yeojeong/shared';
import {
  CurrentUser,
  RequireConsents,
  type AuthUser,
} from '../common/auth/index.js';
import { ApiErrorResponse } from '../common/errors/index.js';
import { CardImportGuard } from '../common/features.js';
import { StrictThrottle } from '../common/throttle.js';
import { CardImportService } from './card-import.service.js';
import {
  CardImportConfigDto,
  FetchCardApprovalsDto,
  FetchCardApprovalsResponseDto,
} from './dto/card-import.dto.js';

/**
 * 카드 승인내역 불러오기(S8, CODEF 일회성 조회). 기능 플래그(FEATURE_CARD_IMPORT + CODEF 키)가 꺼져 있으면 404.
 * 저장은 POST /api/wallet/entries/import(src/wallet). 흐름·저장하지 않는 것은 README.md
 */
@ApiTags('card-import')
@ApiErrorResponse(401, 'UNAUTHENTICATED')
@ApiErrorResponse(404, 'NOT_FOUND')
@UseGuards(CardImportGuard)
@Controller('card-import')
export class CardImportController {
  constructor(private readonly cardImport: CardImportService) {}

  @ApiOperation({
    summary: '불러오기 설정',
    description:
      'CODEF 공개키(비밀번호 암호화용), 카드사 목록·기간 상한, 기본 조회 기간(진행 중 여정, 없으면 최근 7일), CARD_IMPORT 동의 상태.',
  })
  @ApiOkResponse({ type: CardImportConfigDto })
  @Get('config')
  config(@CurrentUser() user: AuthUser): Promise<CardImportConfig> {
    return this.cardImport.config(user.id);
  }

  @ApiOperation({
    summary: '카드 승인내역 조회(저장하지 않음)',
    description:
      '카드사 아이디 + RSA로 암호화한 비밀번호로 CODEF에서 한 번 조회해 응답으로만 돌려준다. 로그인 정보·결과는 서버에 남지 않는다. ' +
      '추가 인증이 필요하면 status TWO_WAY_REQUIRED + twoWayToken → 같은 본문에 twoWay {token, code}를 더해 다시 보낸다. ' +
      '사용자당 10분 5회(추가 인증 이어가기는 세지 않는다). CARD_IMPORT 동의가 없으면 403 CONSENT_REQUIRED.',
  })
  @ApiOkResponse({ type: FetchCardApprovalsResponseDto })
  @ApiErrorResponse(
    400,
    'VALIDATION_FAILED',
    'CARD_LOGIN_FAILED',
    'CARD_TWO_WAY_INVALID',
    'CARD_PASSWORD_ENCRYPTION_INVALID',
  )
  @ApiErrorResponse(403, 'CONSENT_REQUIRED', 'CSRF_REJECTED')
  @ApiErrorResponse(
    409,
    'CARD_ACCOUNT_ACTION_REQUIRED',
    'CARD_TWO_WAY_UNSUPPORTED',
  )
  @ApiErrorResponse(410, 'CARD_TWO_WAY_EXPIRED')
  @ApiErrorResponse(429, 'CARD_IMPORT_RATE_LIMITED', 'RATE_LIMITED')
  @ApiErrorResponse(502, 'CARD_IMPORT_FAILED')
  @ApiErrorResponse(503, 'CARD_COMPANY_UNAVAILABLE')
  @RequireConsents(CARD_IMPORT_REQUIRED_CONSENTS)
  @StrictThrottle()
  @HttpCode(200)
  @Post('fetch')
  fetch(
    @CurrentUser() user: AuthUser,
    @Body() body: FetchCardApprovalsDto,
  ): Promise<FetchCardApprovalsResponse> {
    return this.cardImport.fetch(user.id, body);
  }
}
