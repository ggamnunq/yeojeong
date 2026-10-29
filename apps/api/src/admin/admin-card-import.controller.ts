import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  Post,
  Req,
} from '@nestjs/common';
import {
  ApiCookieAuth,
  ApiCreatedResponse,
  ApiNoContentResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';
import type {
  AdminCardImportGrant,
  AdminCardImportGrantList,
} from '@yeojeong/shared';
import type { Request } from 'express';
import {
  AppException,
  ApiErrorResponse,
  NotFoundError,
} from '../common/errors/index.js';
import { AdminAuditLog } from './admin-audit.js';
import { AdminCardImportService } from './admin-card-import.service.js';
import { AdminConfig } from './admin-config.js';
import { ADMIN_COOKIE } from './admin.constants.js';
import { AdminOnly } from './admin.guard.js';
import { UUID } from './admin-users.service.js';
import {
  AdminCardImportGrantDto,
  AdminCardImportGrantListDto,
  AdminCreateCardImportGrantDto,
} from './dto/admin-card-import.dto.js';

/** 조치 실패 결과 코드(접근 기록 details.result) */
const failureCode = (error: unknown) =>
  error instanceof AppException ? error.code : 'INTERNAL_ERROR';

@ApiTags('admin')
@ApiCookieAuth(ADMIN_COOKIE)
@AdminOnly()
@Controller('admin/card-import-grants')
export class AdminCardImportController {
  constructor(
    private readonly grants: AdminCardImportService,
    private readonly audit: AdminAuditLog,
    private readonly admin: AdminConfig,
  ) {}

  @ApiOperation({
    summary: '카드 불러오기 권한 목록',
    description:
      '관리자 페이지에서 준 권한(최근 순) + env CARD_IMPORT_ALLOWED_USER_IDS에만 있는 항목(회수 불가). 현재 플래그 단계·CARD_IMPORT 동의·오늘 조회 수. 접근 기록 ADMIN_VIEW_CARD_IMPORT_GRANTS',
  })
  @ApiOkResponse({ type: AdminCardImportGrantListDto })
  @ApiErrorResponse(401, 'ADMIN_UNAUTHENTICATED')
  @Get()
  async list(@Req() req: Request): Promise<AdminCardImportGrantList> {
    const list = await this.grants.list();
    // 기록 없는 열람이 없게 응답 전에 쓴다(실패하면 500)
    await this.audit.record(req, 'ADMIN_VIEW_CARD_IMPORT_GRANTS', {
      resourceType: 'CARD_IMPORT_GRANT',
      details: {
        count: list.items.length,
        userIds: list.items.map((item) => item.userId),
      },
    });
    return list;
  }

  @ApiOperation({
    summary: '카드 불러오기 권한 부여',
    description:
      'FEATURE_CARD_IMPORT=allowlist일 때 바로(다음 요청부터) 켜진다. 되돌릴 수 있어 재인증 없음. 시도를 먼저 기록하고(기록 실패면 처리하지 않음) 결과를 채운다. 접근 기록 ADMIN_GRANT_CARD_IMPORT',
  })
  @ApiCreatedResponse({ type: AdminCardImportGrantDto })
  @ApiErrorResponse(400, 'VALIDATION_FAILED')
  @ApiErrorResponse(401, 'ADMIN_UNAUTHENTICATED')
  @ApiErrorResponse(403, 'CSRF_REJECTED')
  @ApiErrorResponse(404, 'NOT_FOUND')
  @ApiErrorResponse(409, 'ADMIN_CARD_IMPORT_GRANT_EXISTS')
  @Post()
  async create(
    @Body() body: AdminCreateCardImportGrantDto,
    @Req() req: Request,
  ): Promise<AdminCardImportGrant> {
    const note = body.note?.trim() || null;
    const noteDetails: Record<string, string> = note ? { note } : {};
    const logId = await this.audit.record(req, 'ADMIN_GRANT_CARD_IMPORT', {
      resourceType: 'USER',
      resourceId: body.userId,
      details: { result: 'PENDING', ...noteDetails },
    });
    try {
      // 관리자 세션 가드를 통과했으면 actorId가 있다(꺼져 있으면 404)
      const grant = await this.grants.grant(
        body.userId,
        note,
        this.admin.actorId as string,
      );
      await this.audit.finish(logId, { result: 'GRANTED', ...noteDetails });
      return grant;
    } catch (error) {
      await this.audit
        .finish(logId, { result: failureCode(error), ...noteDetails })
        .catch(() => undefined);
      throw error;
    }
  }

  @ApiOperation({
    summary: '카드 불러오기 권한 회수',
    description:
      '관리자 페이지에서 준 권한만 지운다(다음 요청부터 카드 불러오기 API 404). env에만 있으면 409(tfvars에서 빼야 한다). 접근 기록 ADMIN_REVOKE_CARD_IMPORT',
  })
  @ApiNoContentResponse()
  @ApiErrorResponse(401, 'ADMIN_UNAUTHENTICATED')
  @ApiErrorResponse(403, 'CSRF_REJECTED')
  @ApiErrorResponse(404, 'NOT_FOUND')
  @ApiErrorResponse(409, 'ADMIN_CARD_IMPORT_GRANT_ENV_ONLY')
  @HttpCode(204)
  @Delete(':userId')
  async revoke(
    @Param('userId') userId: string,
    @Req() req: Request,
  ): Promise<void> {
    // UUID가 아니면 기록(resource_id uuid)을 쓰기 전에 없는 경로와 같은 404
    if (!UUID.test(userId)) throw new NotFoundError();
    const logId = await this.audit.record(req, 'ADMIN_REVOKE_CARD_IMPORT', {
      resourceType: 'USER',
      resourceId: userId,
      details: { result: 'PENDING' },
    });
    try {
      const { grantedAt } = await this.grants.revoke(userId);
      await this.audit.finish(logId, {
        result: 'REVOKED',
        grantedAt: grantedAt.toISOString(),
      });
    } catch (error) {
      await this.audit
        .finish(logId, { result: failureCode(error) })
        .catch(() => undefined);
      throw error;
    }
  }
}
