import { Body, Controller, HttpCode, Post } from '@nestjs/common';
import {
  ApiNoContentResponse,
  ApiOperation,
  ApiPayloadTooLargeResponse,
  ApiTags,
  ApiTooManyRequestsResponse,
} from '@nestjs/swagger';
import { seconds, Throttle } from '@nestjs/throttler';
import type { AuthUser } from '../common/auth/auth-context.js';
import { CurrentUser, Public } from '../common/auth/decorators.js';
import { ClientErrorReportDto } from './client-error.dto.js';
import { ClientErrorsService } from './client-errors.service.js';

/** IP당 1분 한도 */
export const CLIENT_ERROR_IP_LIMIT_PER_MIN = 20;

@ApiTags('client-errors')
@Controller('client-errors')
export class ClientErrorsController {
  constructor(private readonly clientErrors: ClientErrorsService) {}

  @ApiOperation({
    summary: '화면 오류 보고',
    description:
      '화면(에러 경계·window.onerror·unhandledrejection)에서 난 오류를 구조화 로그(severity=WARNING, event=client_error)로만 남긴다. DB에 저장하지 않는다. ' +
      '로그인 없이 열려 있고(로그인 전 화면 오류도 받는다), 로그인 상태면 userId 대신 HMAC userRef를 남긴다. ' +
      '상태를 바꾸는 요청이라 CSRF(Origin) 검사를 그대로 받는다(화면은 같은 origin fetch keepalive로 보낸다). ' +
      `본문 8KB 상한(413), IP당 1분 ${CLIENT_ERROR_IP_LIMIT_PER_MIN}회·사용자당 1분 10회(429).`,
  })
  @ApiNoContentResponse({
    description: '받음(인스턴스 상한을 넘으면 남기지 않고 버린다)',
  })
  @ApiPayloadTooLargeResponse({ description: 'PAYLOAD_TOO_LARGE' })
  @ApiTooManyRequestsResponse({ description: 'RATE_LIMITED' })
  @Public()
  @Throttle({
    default: { ttl: seconds(60), limit: CLIENT_ERROR_IP_LIMIT_PER_MIN },
  })
  @HttpCode(204)
  @Post()
  report(
    @Body() body: ClientErrorReportDto,
    @CurrentUser({ optional: true }) user?: AuthUser,
  ): void {
    this.clientErrors.record(body, { userId: user?.id });
  }
}
