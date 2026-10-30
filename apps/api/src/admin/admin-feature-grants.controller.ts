import {
  Body,
  Controller,
  Delete,
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
  ApiTags,
} from '@nestjs/swagger';
import {
  FEATURE_KEY_VALUES,
  type AdminFeatureGrantList,
  type AdminFeatureGrantRow,
  type FeatureKey,
} from '@yeojeong/shared';
import type { Request } from 'express';
import {
  AppException,
  ApiErrorResponse,
  NotFoundError,
} from '../common/errors/index.js';
import { AdminAuditLog } from './admin-audit.js';
import { AdminConfig } from './admin-config.js';
import { AdminFeatureGrantsService } from './admin-feature-grants.service.js';
import { ADMIN_COOKIE } from './admin.constants.js';
import { AdminOnly } from './admin.guard.js';
import { UUID } from './admin-users.service.js';
import {
  AdminCreateFeatureGrantDto,
  AdminFeatureGrantListDto,
  AdminFeatureGrantListQueryDto,
  AdminFeatureGrantRowDto,
} from './dto/admin-feature-grants.dto.js';

/** 조치 실패 결과 코드(접근 기록 details.result) */
const failureCode = (error: unknown) =>
  error instanceof AppException ? error.code : 'INTERNAL_ERROR';

const isFeatureKey = (value: string): value is FeatureKey =>
  (FEATURE_KEY_VALUES as readonly string[]).includes(value);

/**
 * 회원별 기능 권한(ADMIN3). 접근 기록에는 기능 키·결과·회원 ID만 남긴다 —
 * 검색어 원문·메모 내용은 남기지 않는다(메모는 있었는지만, 내용은 권한 행에만).
 */
@ApiTags('admin')
@ApiCookieAuth(ADMIN_COOKIE)
@AdminOnly()
@Controller('admin/feature-grants')
export class AdminFeatureGrantsController {
  constructor(
    private readonly grants: AdminFeatureGrantsService,
    private readonly audit: AdminAuditLog,
    private readonly admin: AdminConfig,
  ) {}

  @ApiOperation({
    summary: '기능 권한 표(회원 × 기능)',
    description:
      '검색이 없으면 권한(관리자·env)이 있는 회원 전부, 있으면 닉네임 부분 일치·사용자 ID 정확 일치(최대 20명). 기능별 설정·실제 단계와 env 목록 인원, 회원별 출처·지금 켜짐·CARD_IMPORT 동의·오늘 카드 조회 수. 접근 기록 ADMIN_VIEW_FEATURE_GRANTS',
  })
  @ApiOkResponse({ type: AdminFeatureGrantListDto })
  @ApiErrorResponse(400, 'VALIDATION_FAILED')
  @ApiErrorResponse(401, 'ADMIN_UNAUTHENTICATED')
  @Get()
  async list(
    @Query() query: AdminFeatureGrantListQueryDto,
    @Req() req: Request,
  ): Promise<AdminFeatureGrantList> {
    const { response, kind } = await this.grants.list(query.q);
    // 기록 없는 열람이 없게 응답 전에 쓴다(실패하면 500). 검색어 원문은 남기지 않는다
    await this.audit.record(req, 'ADMIN_VIEW_FEATURE_GRANTS', {
      resourceType: 'FEATURE_GRANT',
      details: {
        count: response.items.length,
        query: kind,
        userIds: response.items.map((item) => item.userId),
      },
    });
    return response;
  }

  @ApiOperation({
    summary: '기능 권한 부여',
    description:
      '그 기능이 allowlist 단계면 바로(다음 요청부터) 켜진다. 되돌릴 수 있어 재인증 없음. 시도를 먼저 기록하고(기록 실패면 처리하지 않음) 결과를 채운다. 응답은 그 회원의 줄 전체. 접근 기록 ADMIN_GRANT_FEATURE',
  })
  @ApiCreatedResponse({ type: AdminFeatureGrantRowDto })
  @ApiErrorResponse(400, 'VALIDATION_FAILED')
  @ApiErrorResponse(401, 'ADMIN_UNAUTHENTICATED')
  @ApiErrorResponse(403, 'CSRF_REJECTED')
  @ApiErrorResponse(404, 'NOT_FOUND')
  @ApiErrorResponse(409, 'ADMIN_FEATURE_GRANT_EXISTS')
  @Post()
  async create(
    @Body() body: AdminCreateFeatureGrantDto,
    @Req() req: Request,
  ): Promise<AdminFeatureGrantRow> {
    const note = body.note?.trim() || null;
    const base = { feature: body.feature, noteGiven: note ? 'YES' : 'NO' };
    const logId = await this.audit.record(req, 'ADMIN_GRANT_FEATURE', {
      resourceType: 'USER',
      resourceId: body.userId,
      details: { ...base, result: 'PENDING' },
    });
    try {
      // 관리자 세션 가드를 통과했으면 actorId가 있다(꺼져 있으면 404)
      const row = await this.grants.grant(
        body.userId,
        body.feature,
        note,
        this.admin.actorId as string,
      );
      await this.audit.finish(logId, { ...base, result: 'GRANTED' });
      return row;
    } catch (error) {
      await this.audit
        .finish(logId, { ...base, result: failureCode(error) })
        .catch(() => undefined);
      throw error;
    }
  }

  @ApiOperation({
    summary: '기능 권한 회수',
    description:
      '관리자 페이지에서 준 권한만 지운다(다음 요청부터 그 기능 API 404). env에만 있으면 409(tfvars에서 빼야 한다). 접근 기록 ADMIN_REVOKE_FEATURE',
  })
  @ApiParam({ name: 'feature', enum: FEATURE_KEY_VALUES })
  @ApiNoContentResponse()
  @ApiErrorResponse(401, 'ADMIN_UNAUTHENTICATED')
  @ApiErrorResponse(403, 'CSRF_REJECTED')
  @ApiErrorResponse(404, 'NOT_FOUND')
  @ApiErrorResponse(409, 'ADMIN_FEATURE_GRANT_ENV_ONLY')
  @HttpCode(204)
  @Delete(':userId/:feature')
  async revoke(
    @Param('userId') userId: string,
    @Param('feature') feature: string,
    @Req() req: Request,
  ): Promise<void> {
    // UUID·기능 키가 아니면 기록(resource_id uuid)을 쓰기 전에 없는 경로와 같은 404
    if (!UUID.test(userId) || !isFeatureKey(feature)) {
      throw new NotFoundError();
    }
    const logId = await this.audit.record(req, 'ADMIN_REVOKE_FEATURE', {
      resourceType: 'USER',
      resourceId: userId,
      details: { feature, result: 'PENDING' },
    });
    try {
      const { grantedAt } = await this.grants.revoke(userId, feature);
      await this.audit.finish(logId, {
        feature,
        result: 'REVOKED',
        grantedAt: grantedAt.toISOString(),
      });
    } catch (error) {
      await this.audit
        .finish(logId, { feature, result: failureCode(error) })
        .catch(() => undefined);
      throw error;
    }
  }
}
