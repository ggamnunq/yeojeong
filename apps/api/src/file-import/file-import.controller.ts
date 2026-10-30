import {
  Body,
  Controller,
  HttpCode,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';
import {
  ApiCreatedResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';
import { seconds, Throttle } from '@nestjs/throttler';
import type {
  FileImportCheckResponse,
  FileImportProvider,
  FileImportResponse,
} from '@yeojeong/shared';
import type { Request } from 'express';
import { CurrentUser, type AuthUser } from '../common/auth/index.js';
import { ApiErrorResponse, NotFoundError } from '../common/errors/index.js';
import { FeatureAccess, FileImportGuard } from '../common/features.js';
import {
  FileImportCheckDto,
  FileImportCheckResponseDto,
  FileImportDto,
  FileImportResponseDto,
} from './dto/file-import.dto.js';
import { FileImportRateGuard } from './file-import-rate.guard.js';
import { FileImportService } from './file-import.service.js';

/**
 * 거래 내역 파일 가져오기(W10 위챗페이 · W11 알리페이). 파일은 브라우저에서만 읽고 고른 결제만 받는다.
 * 그 회원에게 켜진 공급자가 없으면 404(FileImportGuard), 그 회원에게 켜지지 않은 공급자로 요청해도 404
 * (FILE_IMPORT_PROVIDERS에 없거나, allowlist 단계에서 그 공급자 권한 FILE_IMPORT_WECHAT·FILE_IMPORT_ALIPAY가 없을 때)
 */
@ApiTags('wallet')
@ApiErrorResponse(401, 'UNAUTHENTICATED')
@ApiErrorResponse(404, 'NOT_FOUND')
@ApiErrorResponse(429, 'RATE_LIMITED')
@UseGuards(FileImportGuard)
@Controller('wallet/entries/file-import')
export class FileImportController {
  constructor(
    private readonly fileImport: FileImportService,
    private readonly access: FeatureAccess,
  ) {}

  /** 이 회원에게 켜지지 않은 공급자는 기능이 없는 것처럼 404(기능 플래그와 같은 이유). 권한 행은 가드와 같은 요청 캐시를 쓴다 */
  private async assertProvider(
    userId: string,
    provider: FileImportProvider,
    req: Request,
  ) {
    if (!(await this.access.fileImportFor(userId, provider, req))) {
      throw new NotFoundError();
    }
  }

  @ApiOperation({
    summary: '거래 내역 파일에서 고른 결제 저장(W10 · W11)',
    description:
      '브라우저가 파일에서 읽어 고른 결제를 지갑에 저장한다(source FILE_IMPORT). 직접 입력과 같은 입력 규칙·여정 자동 연결을 쓰고, ' +
      '저장한 항목은 직접 입력처럼 고치거나 지울 수 있다. 같은 거래(사용자 + 공급자 + txnDigest)가 이미 있으면 새로 만들지 않는다(created=false, 다시 보내도 안전). ' +
      '한 트랜잭션으로 저장해 하나라도 실패하면(검사·원화 상한·환율 없음·일일 상한) 아무것도 저장하지 않는다. 사용자당 1분 5회·KST 하루 2,000건. 계약 밖 필드는 400. 기능 플래그가 꺼져 있거나 이 회원에게 켜지지 않은 공급자면(allowlist 단계의 공급자별 권한 포함) 404.',
  })
  @ApiCreatedResponse({ type: FileImportResponseDto })
  @ApiErrorResponse(400, 'VALIDATION_FAILED')
  @ApiErrorResponse(429, 'FILE_IMPORT_RATE_LIMITED', 'FILE_IMPORT_DAILY_LIMIT')
  @ApiErrorResponse(503, 'FX_RATE_UNAVAILABLE')
  // 사용자 ID 기준 1분 5회(FileImportRateGuard)가 주 제한이고, IP 기준(1분 60회)은 같은 IP 뒤 여러 사용자를 위한 넉넉한 바깥 울타리
  @Throttle({ default: { ttl: seconds(60), limit: 60 } })
  @UseGuards(FileImportRateGuard)
  @Post()
  async import(
    @CurrentUser() user: AuthUser,
    @Body() body: FileImportDto,
    @Req() req: Request,
  ): Promise<FileImportResponse> {
    await this.assertProvider(user.id, body.provider, req);
    return this.fileImport.import(user.id, body);
  }

  @ApiOperation({
    summary: '파일에서 읽은 결제의 저장 여부 확인(W10 · W11)',
    description:
      '결과 화면의 "추가됨"·기본 선택 근거. txnDigest는 HMAC으로만 비교하고 저장·기록하지 않는다. 금액·가맹점은 받지 않는다.',
  })
  @ApiOkResponse({ type: FileImportCheckResponseDto })
  @ApiErrorResponse(400, 'VALIDATION_FAILED')
  @Throttle({ default: { ttl: seconds(60), limit: 30 } })
  @HttpCode(200)
  @Post('check')
  async check(
    @CurrentUser() user: AuthUser,
    @Body() body: FileImportCheckDto,
    @Req() req: Request,
  ): Promise<FileImportCheckResponse> {
    await this.assertProvider(user.id, body.provider, req);
    return this.fileImport.check(user.id, body);
  }
}
