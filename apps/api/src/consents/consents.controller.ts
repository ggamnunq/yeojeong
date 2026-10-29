import {
  Body,
  Controller,
  Get,
  HttpCode,
  Param,
  Post,
  Query,
  Req,
} from '@nestjs/common';
import {
  ApiCookieAuth,
  ApiCreatedResponse,
  ApiNoContentResponse,
  ApiOkResponse,
  ApiOperation,
  ApiParam,
  ApiQuery,
  ApiTags,
} from '@nestjs/swagger';
import {
  CARD_IMPORT_REQUIRED_CONSENTS,
  CONSENT_STAGE_VALUES,
  FIN_LINK_REQUIRED_CONSENTS,
  REVOCABLE_CONSENTS,
  type ConsentDocumentSummary,
  type ConsentId,
  type ConsentStage,
  type ConsentStatusResponse,
  type RevocableConsent,
  type RevocableConsentId,
} from '@yeojeong/shared';
import type { Request } from 'express';
import { ConsentChecker } from '../common/auth/consent-checker.js';
import { CurrentUser, Public } from '../common/auth/decorators.js';
import type { AuthUser } from '../common/auth/auth-context.js';
import { ApiErrorResponse } from '../common/errors/api-error.dto.js';
import {
  NotFoundError,
  ValidationFailedError,
} from '../common/errors/app-exception.js';
import { CardImportAccess, FeatureFlags } from '../common/features.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { ConsentsService, consentEvidence } from './consents.service.js';
import {
  ConsentDocumentSummaryDto,
  ConsentStatusResponseDto,
  ConsentSubmitDto,
  RevocableConsentDto,
  SUBMIT_STAGE_SCREENS,
} from './dto/consent.dto.js';

/** 단계별로 한 번에 받아야 하는 동의(POST /api/consents·GET /api/consents/status) */
const STAGE_REQUIRED: Record<'FIN_LINK' | 'CARD_IMPORT', readonly ConsentId[]> =
  {
    FIN_LINK: FIN_LINK_REQUIRED_CONSENTS,
    CARD_IMPORT: CARD_IMPORT_REQUIRED_CONSENTS,
  };

function parseStage(value: unknown, allowed: readonly ConsentStage[]) {
  if (
    typeof value === 'string' &&
    (allowed as readonly string[]).includes(value)
  ) {
    return value as ConsentStage;
  }
  throw new ValidationFailedError([
    { path: 'stage', code: 'isIn', message: '동의 단계가 올바르지 않아요' },
  ]);
}

@ApiTags('consents')
@Controller('consents')
export class ConsentsController {
  constructor(
    private readonly consents: ConsentsService,
    private readonly checker: ConsentChecker,
    private readonly prisma: PrismaService,
    private readonly features: FeatureFlags,
    private readonly cardImport: CardImportAccess,
  ) {}

  /**
   * 연동 동의(FIN_LINK)는 계좌·카드 연결을 숨긴 동안, 카드 승인내역 불러오기 동의(CARD_IMPORT)는 그 기능을 숨긴 동안 받지 않는다(FR-006 → 404).
   * 철회(HF-58)는 기능이 꺼져 있어도 늘 받는다
   */
  private async assertAccountLink(stage: ConsentStage, userId?: string) {
    if (stage === 'FIN_LINK' && !this.features.accountLink) {
      throw new NotFoundError();
    }
    // 문서 목록(비로그인)은 단계가 off가 아니면 보여 준다. 상태·저장은 그 사용자에게 켜져 있을 때만(allowlist: env 목록 또는 관리자 권한)
    if (
      stage === 'CARD_IMPORT' &&
      (userId === undefined
        ? this.features.cardImportMode === 'off'
        : !(await this.cardImport.enabledFor(userId)))
    ) {
      throw new NotFoundError();
    }
  }

  @ApiOperation({
    summary: '동의 문서 현재 버전 (FR-104·809·903)',
    description:
      'WF-04(SIGNUP)·WF-05b(FIN_LINK) 체크 목록. hidden 항목은 화면에 그리지 않는다.',
  })
  @ApiQuery({ name: 'stage', enum: CONSENT_STAGE_VALUES })
  @ApiOkResponse({ type: [ConsentDocumentSummaryDto] })
  @ApiErrorResponse(400, 'VALIDATION_FAILED')
  @Public()
  @Get('documents')
  async documents(
    @Query('stage') stage: unknown,
  ): Promise<ConsentDocumentSummary[]> {
    const parsed = parseStage(stage, CONSENT_STAGE_VALUES);
    await this.assertAccountLink(parsed);
    return this.consents.documents(parsed);
  }

  @ApiOperation({
    summary: '연동·불러오기 동의 상태 (FR-809, S8)',
    description:
      'valid가 false면 결제수단 연결(FIN_LINK) 전에 WF-05b 동의 시트를, 카드 승인내역 불러오기(CARD_IMPORT) 전에 동의 시트를 띄운다.',
  })
  @ApiCookieAuth('yj_session')
  @ApiQuery({ name: 'stage', enum: ['FIN_LINK', 'CARD_IMPORT'] })
  @ApiOkResponse({ type: ConsentStatusResponseDto })
  @ApiErrorResponse(401, 'UNAUTHENTICATED')
  @ApiErrorResponse(403, 'CONSENT_REQUIRED')
  @Get('status')
  async status(
    @CurrentUser() user: AuthUser,
    @Query('stage') stage: unknown,
  ): Promise<ConsentStatusResponse> {
    const parsed = parseStage(stage, ['FIN_LINK', 'CARD_IMPORT']) as
      'FIN_LINK' | 'CARD_IMPORT';
    await this.assertAccountLink(parsed, user.id);
    const required = await this.checker.findMissing(
      user.id,
      STAGE_REQUIRED[parsed],
    );
    return {
      valid: required.length === 0,
      missing: required.map((r) => r.id),
      required,
    };
  }

  @ApiOperation({
    summary: '연동·불러오기 동의 저장 (FR-809, S8)',
    description:
      'stage FIN_LINK: FIN_LINK·FIN_PRIVACY·THIRD_PARTY 현재 버전에 모두 agreed=true여야 결제수단 연결을 시작할 수 있다. ' +
      'stage CARD_IMPORT(screen CARD_IMPORT): CARD_IMPORT 현재 버전에 agreed=true여야 카드 승인내역을 불러올 수 있다(최초 1회, HF-58에서 철회).',
  })
  @ApiCookieAuth('yj_session')
  @ApiCreatedResponse({ type: ConsentStatusResponseDto })
  @ApiErrorResponse(400, 'VALIDATION_FAILED', 'TERMS_REQUIRED')
  @ApiErrorResponse(401, 'UNAUTHENTICATED')
  @ApiErrorResponse(403, 'CSRF_REJECTED', 'CONSENT_REQUIRED')
  @Post()
  async submit(
    @CurrentUser() user: AuthUser,
    @Body() dto: ConsentSubmitDto,
    @Req() req: Request,
  ): Promise<ConsentStatusResponse> {
    await this.assertAccountLink(dto.stage, user.id);
    if (
      !(SUBMIT_STAGE_SCREENS[dto.stage] as readonly string[]).includes(
        dto.screen,
      )
    ) {
      throw new ValidationFailedError([
        {
          path: 'screen',
          code: 'isIn',
          message: '화면 값이 올바르지 않아요',
        },
      ]);
    }
    const { documents } = await this.consents.check(
      dto.stage,
      dto.agreements,
      STAGE_REQUIRED[dto.stage],
    );
    await this.prisma.$transaction((tx) =>
      this.consents.record(tx, {
        userId: user.id,
        documents,
        screen: dto.screen,
        method: dto.method,
        evidence: consentEvidence(req),
      }),
    );
    return { valid: true, missing: [], required: [] };
  }

  @ApiOperation({
    summary: '철회할 수 있는 동의 목록 (HF-58 동의 관리)',
    description:
      '지금 유효하게 동의한 철회 가능 항목(현재 CARD_IMPORT만). 동의하지 않았거나 철회한 항목은 나오지 않는다. 기능 플래그와 무관하게 늘 동작한다.',
  })
  @ApiCookieAuth('yj_session')
  @ApiOkResponse({ type: [RevocableConsentDto] })
  @ApiErrorResponse(401, 'UNAUTHENTICATED')
  @Get('revocable')
  revocable(@CurrentUser() user: AuthUser): Promise<RevocableConsent[]> {
    return this.consents.revocable(user.id);
  }

  @ApiOperation({
    summary: '동의 철회 (HF-58 동의 관리)',
    description:
      '유효한 동의 행에 철회 시각을 남긴다(행은 지우지 않는다, 3년 보존). 이미 저장한 지갑 항목은 그대로다. ' +
      '다음 불러오기 전에 다시 동의(POST /api/consents stage CARD_IMPORT)를 받는다. 유효한 동의가 없어도 204(멱등).',
  })
  @ApiCookieAuth('yj_session')
  @ApiParam({ name: 'consentId', enum: REVOCABLE_CONSENTS })
  @ApiNoContentResponse({ description: '철회했다(또는 이미 철회돼 있었다)' })
  @ApiErrorResponse(401, 'UNAUTHENTICATED')
  @ApiErrorResponse(403, 'CSRF_REJECTED')
  @ApiErrorResponse(404, 'NOT_FOUND')
  @HttpCode(204)
  @Post(':consentId/withdraw')
  async withdraw(
    @CurrentUser() user: AuthUser,
    @Param('consentId') consentId: string,
  ): Promise<void> {
    if (!(REVOCABLE_CONSENTS as readonly string[]).includes(consentId)) {
      throw new NotFoundError();
    }
    await this.consents.withdraw(user.id, consentId as RevocableConsentId);
  }
}
