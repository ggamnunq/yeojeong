import { Body, Controller, Get, Post, Query, Req } from '@nestjs/common';
import {
  ApiCookieAuth,
  ApiCreatedResponse,
  ApiOkResponse,
  ApiOperation,
  ApiQuery,
  ApiTags,
} from '@nestjs/swagger';
import {
  CONSENT_STAGE_VALUES,
  FIN_LINK_REQUIRED_CONSENTS,
  type ConsentDocumentSummary,
  type ConsentStage,
  type ConsentStatusResponse,
} from '@yeojeong/shared';
import type { Request } from 'express';
import { ConsentChecker } from '../common/auth/consent-checker.js';
import { CurrentUser, Public } from '../common/auth/decorators.js';
import type { AuthUser } from '../common/auth/auth-context.js';
import { ApiErrorResponse } from '../common/errors/api-error.dto.js';
import { ValidationFailedError } from '../common/errors/app-exception.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { ConsentsService, consentEvidence } from './consents.service.js';
import {
  ConsentDocumentSummaryDto,
  ConsentStatusResponseDto,
  ConsentSubmitDto,
} from './dto/consent.dto.js';

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
  ) {}

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
  documents(@Query('stage') stage: unknown): Promise<ConsentDocumentSummary[]> {
    return this.consents.documents(parseStage(stage, CONSENT_STAGE_VALUES));
  }

  @ApiOperation({
    summary: '연동 동의 상태 (FR-809)',
    description:
      'valid가 false면 결제수단 연결 전에 WF-05b 동의 시트를 띄운다.',
  })
  @ApiCookieAuth('yj_session')
  @ApiQuery({ name: 'stage', enum: ['FIN_LINK'] })
  @ApiOkResponse({ type: ConsentStatusResponseDto })
  @ApiErrorResponse(401, 'UNAUTHENTICATED')
  @ApiErrorResponse(403, 'CONSENT_REQUIRED')
  @Get('status')
  async status(
    @CurrentUser() user: AuthUser,
    @Query('stage') stage: unknown,
  ): Promise<ConsentStatusResponse> {
    parseStage(stage, ['FIN_LINK']);
    const required = await this.checker.findMissing(
      user.id,
      FIN_LINK_REQUIRED_CONSENTS,
    );
    return {
      valid: required.length === 0,
      missing: required.map((r) => r.id),
      required,
    };
  }

  @ApiOperation({
    summary: '연동 동의 저장 (FR-809)',
    description:
      'FIN_LINK·FIN_PRIVACY·THIRD_PARTY 현재 버전에 모두 agreed=true여야 한다. 저장에 성공해야 결제수단 연결을 시작할 수 있다.',
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
    const { documents } = await this.consents.check(
      'FIN_LINK',
      dto.agreements,
      FIN_LINK_REQUIRED_CONSENTS,
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
}
