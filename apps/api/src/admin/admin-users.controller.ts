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
import { AdminOnly } from './admin.guard.js';
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
    if (!detail) throw new NotFoundError();
    await this.audit.record(req, 'ADMIN_VIEW_USER', {
      resourceType: 'USER',
      resourceId: detail.id,
    });
    return detail;
  }

  @ApiOperation({
    summary: '회원 탈퇴 처리',
    description:
      '서비스 내 탈퇴와 같은 파이프라인(AccountDeletionService, 경로 SUPPORT). 사유 필수, 닉네임 재입력이 같아야 한다. 시도를 먼저 기록하고(기록 실패면 처리하지 않음) 결과를 채운다. 접근 기록 ADMIN_WITHDRAW_USER',
  })
  @ApiOkResponse({ type: AdminWithdrawUserResponseDto })
  @ApiErrorResponse(400, 'ADMIN_CONFIRM_MISMATCH')
  @ApiErrorResponse(401, 'ADMIN_UNAUTHENTICATED')
  @ApiErrorResponse(403, 'CSRF_REJECTED')
  @ApiErrorResponse(404, 'NOT_FOUND')
  @StrictThrottle()
  @HttpCode(200)
  @Post(':userId/withdraw')
  async withdraw(
    @Param('userId') userId: string,
    @Body() body: AdminWithdrawUserDto,
    @Req() req: Request,
  ): Promise<AdminWithdrawUserResponse> {
    await this.users.assertWithdrawable(userId, body.confirmNickname);
    const reason = body.reason.trim();
    const logId = await this.audit.record(req, 'ADMIN_WITHDRAW_USER', {
      resourceType: 'USER',
      resourceId: userId,
      details: { reason, result: 'PENDING' },
    });
    try {
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
          result: error instanceof AppException ? error.code : 'INTERNAL_ERROR',
        })
        .catch(() => undefined);
      throw error;
    }
  }
}
