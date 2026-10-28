import {
  Body,
  Controller,
  Get,
  Header,
  HttpCode,
  Post,
  Query,
  Req,
  Res,
} from '@nestjs/common';
import {
  ApiCookieAuth,
  ApiFoundResponse,
  ApiNoContentResponse,
  ApiOkResponse,
  ApiOperation,
  ApiQuery,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import type { AuthSessionResponse, Me } from '@yeojeong/shared';
import type { Request, Response } from 'express';
import type { AuthUser } from '../common/auth/auth-context.js';
import {
  CurrentUser,
  Public,
  SkipConsentCheck,
} from '../common/auth/decorators.js';
import { WebConfig } from '../common/auth/web-config.js';
import { ApiErrorResponse } from '../common/errors/api-error.dto.js';
import { StrictThrottle } from '../common/throttle.js';
import { MeDto } from '../users/dto/user.dto.js';
import { AuthService } from './auth.service.js';
import {
  AuthSessionResponseDto,
  ReconsentDto,
  SignupDto,
} from './dto/auth.dto.js';

@ApiTags('auth')
@Controller('auth')
export class AuthController {
  constructor(
    private readonly auth: AuthService,
    private readonly web: WebConfig,
  ) {}

  @ApiOperation({
    summary: '카카오 로그인 시작 (FR-101)',
    description:
      '카카오 인가 페이지로 302. state는 서명 쿠키(yj_oauth, 10분)에 담는다. 정식 경로는 /api/auth/kakao/start, /api/auth/kakao도 같다.',
  })
  @ApiQuery({
    name: 'returnTo',
    required: false,
    description: '로그인 후 돌아갈 화면 경로(같은 origin, /로 시작)',
  })
  @ApiFoundResponse({ description: 'kauth.kakao.com/oauth/authorize' })
  @Public()
  @Get(['kakao/start', 'kakao'])
  startKakao(@Query('returnTo') returnTo: unknown, @Res() res: Response) {
    res.redirect(302, this.auth.startKakao(res, returnTo));
  }

  @ApiOperation({
    summary: '카카오 로그인 콜백 (FR-101)',
    description:
      '기존 회원: 세션 쿠키 + 302 returnTo 또는 /. 신규: 가입 대기 쿠키(yj_signup, 30분) + 302 /signup/nickname. 취소: /login?error=cancelled, 카카오 오류: /login?error=failed. state 불일치는 400.',
  })
  @ApiFoundResponse({ description: '화면 경로로 이동' })
  @ApiErrorResponse(400, 'BAD_REQUEST')
  @Public()
  @StrictThrottle()
  @Get('kakao/callback')
  async kakaoCallback(
    @Req() req: Request,
    @Res() res: Response,
    @Query() query: Record<string, unknown>,
  ) {
    const path = await this.auth.completeKakao(req, res, query);
    res.redirect(302, this.web.url(path));
  }

  @ApiOperation({
    summary: '세션 상태 (FR-102)',
    description:
      'ANONYMOUS → 로그인, SIGNUP_REQUIRED → 닉네임 화면(signupDraft로 미리 채움), AUTHENTICATED → 진입 라우팅. reconsentRequired가 있으면 재동의 화면.',
  })
  @ApiOkResponse({ type: AuthSessionResponseDto })
  @Header('Cache-Control', 'no-store')
  @Public()
  @Get('session')
  session(@Req() req: Request): Promise<AuthSessionResponse> {
    const state = req.auth
      ? ({ status: 'AUTHENTICATED', ...req.auth } as const)
      : ({ status: 'ANONYMOUS' } as const);
    return this.auth.session(state, req);
  }

  @ApiOperation({
    summary: '가입 (FR-103·104)',
    description:
      '가입 대기 쿠키가 필요하다. TOS·PRIVACY·AGE14 현재 버전에 모두 agreed=true여야 한다. 201: 새로 가입, 200: 같은 카카오 계정이 이미 가입돼 있어 그 계정으로 로그인.',
  })
  @ApiResponse({ status: 201, type: MeDto })
  @ApiOkResponse({ type: MeDto, description: '이미 가입된 계정' })
  @ApiErrorResponse(400, 'VALIDATION_FAILED', 'TERMS_REQUIRED')
  @ApiErrorResponse(401, 'UNAUTHENTICATED')
  @ApiErrorResponse(403, 'CSRF_REJECTED')
  @Public()
  @StrictThrottle()
  @Post('signup')
  async signup(
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
    @Body() dto: SignupDto,
  ): Promise<Me> {
    const { me, created } = await this.auth.signup(req, res, dto);
    res.status(created ? 201 : 200);
    return me;
  }

  @ApiOperation({
    summary: '로그아웃 (FR-106)',
    description:
      '이 기기의 세션만 폐기하고 쿠키를 지운다. 로그인하지 않았어도 204.',
  })
  @ApiNoContentResponse()
  @ApiErrorResponse(403, 'CSRF_REJECTED')
  @Public()
  @HttpCode(204)
  @Post('logout')
  async logout(
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ): Promise<void> {
    await this.auth.logout(req, res);
  }

  @ApiOperation({
    summary: '재동의 (FR-107)',
    description:
      '빠진 가입 필수 동의(403 CONSENT_REQUIRED의 required)를 현재 버전으로 보낸다.',
  })
  @ApiCookieAuth('yj_session')
  @ApiNoContentResponse()
  @ApiErrorResponse(400, 'VALIDATION_FAILED', 'TERMS_REQUIRED')
  @ApiErrorResponse(401, 'UNAUTHENTICATED')
  @ApiErrorResponse(403, 'CSRF_REJECTED')
  @SkipConsentCheck()
  @HttpCode(204)
  @Post('reconsent')
  async reconsent(
    @CurrentUser() user: AuthUser,
    @Req() req: Request,
    @Body() dto: ReconsentDto,
  ): Promise<void> {
    await this.auth.reconsent(user.id, req, dto);
  }
}
