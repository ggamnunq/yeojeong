import {
  Body,
  Controller,
  Get,
  Param,
  Post,
  Query,
  Redirect,
  UseGuards,
} from '@nestjs/common';
import {
  ApiCreatedResponse,
  ApiFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';
import {
  FIN_LINK_REQUIRED_CONSENTS,
  type ConfirmConnectionResponse,
  type ConnectionAttemptView,
  type ConnectionCandidate,
  type StartConnectionResponse,
} from '@yeojeong/shared';
import {
  CurrentUser,
  Public,
  RequireConsents,
  type AuthUser,
} from '../common/auth/index.js';
import { ApiErrorResponse, NotFoundError } from '../common/errors/index.js';
import { AccountLinkGuard } from '../common/features.js';
import { StrictThrottle } from '../common/throttle.js';
import { ConnectionsService } from './connections.service.js';
import {
  ConfirmConnectionDto,
  ConfirmConnectionResponseDto,
  ConnectionAttemptViewDto,
  ConnectionCandidateDto,
  StartConnectionDto,
  StartConnectionResponseDto,
} from './dto/connections.dto.js';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const attemptIdOf = (value: string) => {
  if (!UUID.test(value)) throw new NotFoundError();
  return value;
};

@ApiTags('payment-connections')
@UseGuards(AccountLinkGuard)
@Controller('payment-connections')
export class ConnectionsController {
  constructor(private readonly connections: ConnectionsService) {}

  @ApiOperation({ summary: '토스 연결 시작(FR-801·805). 연동 동의 3건 필요' })
  @ApiCreatedResponse({ type: StartConnectionResponseDto })
  @ApiErrorResponse(403, 'CONSENT_REQUIRED')
  @ApiErrorResponse(404, 'NOT_FOUND')
  @ApiErrorResponse(502, 'PROVIDER_AUTH_FAILED')
  @ApiErrorResponse(503, 'PROVIDER_UNAVAILABLE')
  @RequireConsents(FIN_LINK_REQUIRED_CONSENTS)
  @StrictThrottle()
  @Post()
  start(
    @CurrentUser() user: AuthUser,
    @Body() body: StartConnectionDto,
  ): Promise<StartConnectionResponse> {
    return this.connections.start(user, body);
  }

  @ApiOperation({
    summary: '제공자 콜백(state로 시도를 찾는다)',
    description:
      '성공 302 /wallet/connect/select?attempt=… · 실패 302 /wallet/connect/toss?attempt=…&error=(invalid|expired|cancelled|provider)',
  })
  @ApiFoundResponse()
  @Public()
  @Redirect()
  @Get('callback/toss')
  async callback(
    @Query() query: Record<string, unknown>,
    @CurrentUser({ optional: true }) user?: AuthUser,
  ): Promise<{ url: string; statusCode: number }> {
    return {
      url: await this.connections.callback(query, user?.id),
      statusCode: 302,
    };
  }

  @ApiOperation({ summary: '연결 시도 상태(WF-06 폴링)' })
  @ApiOkResponse({ type: ConnectionAttemptViewDto })
  @ApiErrorResponse(404, 'NOT_FOUND')
  @ApiErrorResponse(410, 'ATTEMPT_EXPIRED')
  @Get('attempts/:attemptId')
  attempt(
    @CurrentUser() user: AuthUser,
    @Param('attemptId') attemptId: string,
  ): Promise<ConnectionAttemptView> {
    return this.connections.getAttempt(user.id, attemptIdOf(attemptId));
  }

  @ApiOperation({ summary: '연결할 계좌·카드 후보(WF-07, 마스킹 값만)' })
  @ApiOkResponse({ type: [ConnectionCandidateDto] })
  @ApiErrorResponse(404, 'NOT_FOUND')
  @ApiErrorResponse(410, 'ATTEMPT_EXPIRED')
  @Get('attempts/:attemptId/candidates')
  candidates(
    @CurrentUser() user: AuthUser,
    @Param('attemptId') attemptId: string,
  ): Promise<ConnectionCandidate[]> {
    return this.connections.getCandidates(user.id, attemptIdOf(attemptId));
  }

  @ApiOperation({
    summary: '고른 계좌·카드 연결(FR-802). 진행 중 여정이 있으면 바로 동기화',
  })
  @ApiCreatedResponse({ type: ConfirmConnectionResponseDto })
  @ApiErrorResponse(400, 'VALIDATION_FAILED')
  @ApiErrorResponse(403, 'CONSENT_REQUIRED')
  @ApiErrorResponse(404, 'NOT_FOUND')
  @ApiErrorResponse(410, 'ATTEMPT_EXPIRED')
  @RequireConsents(FIN_LINK_REQUIRED_CONSENTS)
  @Post('attempts/:attemptId/confirm')
  confirm(
    @CurrentUser() user: AuthUser,
    @Param('attemptId') attemptId: string,
    @Body() body: ConfirmConnectionDto,
  ): Promise<ConfirmConnectionResponse> {
    return this.connections.confirm(
      user.id,
      attemptIdOf(attemptId),
      body.candidateIds,
    );
  }
}
