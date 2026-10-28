import { Body, Controller, Delete, HttpCode, Res } from '@nestjs/common';
import {
  ApiCookieAuth,
  ApiNoContentResponse,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';
import type { Response } from 'express';
import { Audited, fromCurrentUser } from '../audit/index.js';
import {
  CurrentUser,
  SESSION_COOKIE,
  SkipConsentCheck,
  WebConfig,
  type AuthUser,
} from '../common/auth/index.js';
import { ApiErrorResponse } from '../common/errors/index.js';
import { AccountDeletionService } from './account-deletion.service.js';
import { DeleteAccountDto } from './dto/delete-account.dto.js';

@ApiTags('account')
@ApiCookieAuth(SESSION_COOKIE)
@Controller('users/me')
export class AccountController {
  constructor(
    private readonly deletion: AccountDeletionService,
    private readonly web: WebConfig,
  ) {}

  @ApiOperation({
    summary: '서비스 내 탈퇴 (FR-109)',
    description:
      '세션 전부 폐기, 결제수단·거래 원본·개인/미확정 결제 삭제, 그룹장이면 승계, 공동 결제·부담은 "탈퇴한 멤버"로 유지, 동의 철회·처리 기록 후 회원 삭제. 재동의 전에도 부를 수 있다.',
  })
  @ApiNoContentResponse({ description: '탈퇴 완료. 세션 쿠키를 지운다' })
  @ApiErrorResponse(400, 'VALIDATION_FAILED')
  @ApiErrorResponse(401, 'UNAUTHENTICATED')
  @ApiErrorResponse(403, 'CSRF_REJECTED')
  // 재동의를 거부하는 수단은 로그아웃·탈퇴뿐이다(FR-107)
  @SkipConsentCheck()
  @Audited('DELETE_ACCOUNT', {
    resourceType: 'USER',
    resourceId: fromCurrentUser,
  })
  @HttpCode(204)
  @Delete()
  async deleteMe(
    @CurrentUser() user: AuthUser,
    @Body() _body: DeleteAccountDto,
    @Res({ passthrough: true }) res: Response,
  ): Promise<void> {
    await this.deletion.deleteAccount(user.id, { channel: 'IN_APP' });
    res.clearCookie(SESSION_COOKIE, {
      path: '/',
      httpOnly: true,
      sameSite: 'lax',
      secure: this.web.secureCookies,
    });
  }
}
