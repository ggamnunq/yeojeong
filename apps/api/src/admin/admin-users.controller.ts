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
  ApiOkResponse,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';
import type {
  AdminUserDetail,
  AdminUserListResponse,
  AdminWithdrawUserResponse,
} from '@yeojeong/shared';
import type { Request } from 'express';
import {
  AppException,
  ApiErrorResponse,
  NotFoundError,
} from '../common/errors/index.js';
import { StrictThrottle } from '../common/throttle.js';
import { AdminAuditLog } from './admin-audit.js';
import { AdminUsersService } from './admin-users.service.js';
import { ADMIN_COOKIE } from './admin.constants.js';
import { AdminOnly, CurrentAdmin } from './admin.guard.js';
import {
  AdminCredentials,
  type AdminCredentialOutcome,
} from './admin-credentials.js';
import { AdminLoginThrottle } from './admin-login-throttle.js';
import type { AdminContext } from './admin-session.service.js';
import { retryDetails } from '../card-import/card-import-limits.js';
import {
  AdminUserDetailDto,
  AdminUserListQueryDto,
  AdminUserListResponseDto,
  AdminWithdrawUserDto,
  AdminWithdrawUserResponseDto,
} from './dto/admin-users.dto.js';

@ApiTags('admin')
@ApiCookieAuth(ADMIN_COOKIE)
@AdminOnly()
@Controller('admin/users')
export class AdminUsersController {
  constructor(
    private readonly users: AdminUsersService,
    private readonly audit: AdminAuditLog,
    private readonly throttle: AdminLoginThrottle,
    private readonly credentials: AdminCredentials,
  ) {}

  @ApiOperation({
    summary: '회원 목록',
    description:
      '검색(닉네임 부분 일치 · 사용자 ID 정확 일치), 정렬(가입일 · 최근 로그인, 최신 순), 커서 페이지. 접근 기록 ADMIN_VIEW_USERS',
  })
  @ApiOkResponse({ type: AdminUserListResponseDto })
  @ApiErrorResponse(400, 'VALIDATION_FAILED')
  @ApiErrorResponse(401, 'ADMIN_UNAUTHENTICATED')
  @Get()
  async list(
    @Query() query: AdminUserListQueryDto,
    @Req() req: Request,
  ): Promise<AdminUserListResponse> {
    const { response, kind } = await this.users.list(query);
    // 기록 없는 열람이 없게 응답 전에 쓴다(실패하면 500). 검색어 원문은 남기지 않는다
    await this.audit.record(req, 'ADMIN_VIEW_USERS', {
      resourceType: 'USER',
      details: {
        count: response.items.length,
        query: kind,
        sort: query.sort ?? 'createdAt',
        page: query.cursor ? 'NEXT' : 'FIRST',
        // 이 응답으로 본 회원 ID(누구를 열람했는지)
        userIds: response.items.map((u) => u.id),
      },
    });
    return response;
  }

  @ApiOperation({
    summary: '회원 상세',
    description:
      '동의 현황·그룹/여정·건수만(결제 내용·금액·가맹점 없음). 카카오 회원번호는 끝 4자리. 접근 기록 ADMIN_VIEW_USER',
  })
  @ApiOkResponse({ type: AdminUserDetailDto })
  @ApiErrorResponse(401, 'ADMIN_UNAUTHENTICATED')
  @ApiErrorResponse(404, 'NOT_FOUND')
  @Get(':userId')
  async detail(
    @Param('userId') userId: string,
    @Req() req: Request,
  ): Promise<AdminUserDetail> {
    const detail = await this.users.detail(userId);
    // 없는 회원을 찾아본 것도 남긴다(UUID가 아니면 resourceId는 NULL)
    await this.audit.record(req, 'ADMIN_VIEW_USER', {
      resourceType: 'USER',
      resourceId: detail?.id ?? userId,
      details: { result: detail ? 'OK' : 'NOT_FOUND' },
    });
    if (!detail) throw new NotFoundError();
    return detail;
  }

  @ApiOperation({
    summary: '회원 탈퇴 처리',
    description:
      '서비스 내 탈퇴와 같은 파이프라인(AccountDeletionService, 경로 SUPPORT). 사유 필수, 닉네임 재입력, 재인증(비밀번호 + 지금 TOTP). 시도를 먼저 기록하고(기록 실패면 처리하지 않음) 결과(실패 코드 포함)를 채운다. 접근 기록 ADMIN_WITHDRAW_USER',
  })
  @ApiOkResponse({ type: AdminWithdrawUserResponseDto })
  @ApiErrorResponse(400, 'ADMIN_CONFIRM_MISMATCH')
  @ApiErrorResponse(401, 'ADMIN_UNAUTHENTICATED')
  @ApiErrorResponse(403, 'ADMIN_STEP_UP_FAILED')
  @ApiErrorResponse(404, 'NOT_FOUND')
  @ApiErrorResponse(429, 'ADMIN_STEP_UP_RATE_LIMITED')
  @StrictThrottle()
  @HttpCode(200)
  @Post(':userId/withdraw')
  async withdraw(
    @CurrentAdmin() admin: AdminContext,
    @Param('userId') userId: string,
    @Body() body: AdminWithdrawUserDto,
    @Req() req: Request,
  ): Promise<AdminWithdrawUserResponse> {
    const reason = body.reason.trim();
    // 시도를 먼저 기록한다(실패하면 아무것도 하지 않는다). 없는 회원·닉네임 불일치·재인증 실패도 결과 코드로 남는다
    const logId = await this.audit.record(req, 'ADMIN_WITHDRAW_USER', {
      resourceType: 'USER',
      resourceId: userId,
      details: { reason, result: 'PENDING' },
    });
    try {
      // 없는 회원·닉네임 불일치를 먼저 본다(인증 코드를 헛되이 쓰지 않게) → 재인증 → 탈퇴
      await this.users.assertWithdrawable(userId, body.confirmNickname);
      await this.stepUp(admin, body);
      const result = await this.users.withdraw(userId);
      await this.audit.finish(logId, {
        reason,
        result: result.status,
        accountDeletionId: result.accountDeletionId,
      });
      return result;
    } catch (error) {
      await this.audit
        .finish(logId, {
          reason,
          result:
            error instanceof StepUpFailure
              ? `ADMIN_STEP_UP_FAILED:${error.outcome}`
              : error instanceof AppException
                ? error.code
                : 'INTERNAL_ERROR',
        })
        .catch(() => undefined);
      throw error instanceof StepUpFailure
        ? AppException.of('ADMIN_STEP_UP_FAILED')
        : error;
    }
  }

  /**
   * 파괴적 조치 재인증(step-up): 관리자 비밀번호 + 지금 TOTP(재사용 금지 — 로그인 때 쓴 코드는 안 된다).
   * 세션마다 15분 5번까지(넘으면 429 ADMIN_STEP_UP_RATE_LIMITED). 성공하면 그 세션의 카운터를 비운다
   */
  private async stepUp(admin: AdminContext, body: AdminWithdrawUserDto) {
    const now = new Date();
    const keys = AdminLoginThrottle.stepUpKeys(admin.sessionId);
    const block = await this.throttle.consume(keys, now);
    if (block) {
      throw AppException.of('ADMIN_STEP_UP_RATE_LIMITED', {
        details: retryDetails(block.until, now),
      });
    }
    const outcome = await this.credentials.stepUp(body.password, body.totp);
    if (outcome !== 'OK') throw new StepUpFailure(outcome);
    await this.throttle.reset(keys);
  }
}

/** 재인증 실패(접근 기록에는 이유를, 응답은 한 가지 문구로) */
class StepUpFailure extends Error {
  constructor(readonly outcome: AdminCredentialOutcome) {
    super('step-up failed');
  }
}
