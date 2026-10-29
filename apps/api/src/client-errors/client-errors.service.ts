import { createHash, createHmac } from 'node:crypto';
import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { AppException } from '../common/errors/app-exception.js';
import { maskClientErrorMessage } from './client-error-mask.js';
import { FixedWindowLimiter } from './client-error-rate-limiter.js';
import {
  CLIENT_ERROR_MESSAGE_MAX_LENGTH,
  type ClientErrorReportDto,
} from './client-error.dto.js';

/** 로그인 사용자 한 명이 1분에 보낼 수 있는 보고 수(IP당 한도는 컨트롤러의 @Throttle) */
export const CLIENT_ERROR_USER_LIMIT_PER_MIN = 10;
/** 인스턴스 하나가 1분에 남기는 보고 수 상한. 넘으면 조용히 버린다(여러 IP에서 몰려도 로그 비용이 터지지 않게) */
export const CLIENT_ERROR_INSTANCE_LIMIT_PER_MIN = 300;
const MINUTE_MS = 60_000;
const USER_REF_LENGTH = 16;

export type ClientErrorOutcome = 'logged' | 'dropped';

/**
 * 화면 오류 보고를 구조화 로그(severity=ERROR, event=client_error)로만 남긴다. DB에 저장하지 않는다.
 * 로그인 사용자는 userId 대신 userRef(HMAC, 이 용도 전용 접두어)를 남긴다. docs/ops/client-errors.md
 */
@Injectable()
export class ClientErrorsService {
  private readonly logger = new Logger(ClientErrorsService.name);
  private readonly perUser = new FixedWindowLimiter(
    CLIENT_ERROR_USER_LIMIT_PER_MIN,
    MINUTE_MS,
  );
  private readonly perInstance = new FixedWindowLimiter(
    CLIENT_ERROR_INSTANCE_LIMIT_PER_MIN,
    MINUTE_MS,
    1,
  );
  private readonly userRefKey: string | undefined;

  constructor(config: ConfigService) {
    this.userRefKey = config.get<string>('USER_REF_HMAC_KEY') || undefined;
  }

  /**
   * 로그에 남기는 사용자 참조. HMAC-SHA256(USER_REF_HMAC_KEY, "client-error:v1:" + userId) 앞 16자.
   * 동의 기록의 userRefHash와 일부러 다르게 만들어 로그만으로는 DB 기록과 잇지 못한다. 키가 없는 로컬은 접두어 붙인 SHA-256
   */
  userRef(userId: string): string {
    const input = `client-error:v1:${userId}`;
    const digest = this.userRefKey
      ? createHmac('sha256', this.userRefKey).update(input).digest('hex')
      : createHash('sha256').update(`yeojeong:${input}`).digest('hex');
    return digest.slice(0, USER_REF_LENGTH);
  }

  record(
    report: ClientErrorReportDto,
    context: { userId?: string; now?: number } = {},
  ): ClientErrorOutcome {
    const now = context.now ?? Date.now();
    const userRef = context.userId ? this.userRef(context.userId) : undefined;
    if (userRef && !this.perUser.take(userRef, now)) {
      throw AppException.of('RATE_LIMITED');
    }
    if (!this.perInstance.take('all', now)) return 'dropped';

    const errorMessage = maskClientErrorMessage(
      report.message,
      CLIENT_ERROR_MESSAGE_MAX_LENGTH,
    );
    // 형식은 DTO가 경로 템플릿으로 좁혔지만, 실제 ID·숫자를 넣어 보낸 경우를 대비해 같은 규칙으로 가린다
    const route = maskClientErrorMessage(report.route, 200);
    this.logger.error(
      {
        event: 'client_error',
        buildId: report.buildId,
        route,
        source: report.source,
        errorName: report.name,
        errorMessage,
        stack: report.stack,
        clientUserAgent: report.userAgent,
        chunk: report.chunk,
        staleBuild: report.staleBuild ?? null,
        userRef: userRef ?? null,
      },
      `client_error ${report.name} ${route}`,
    );
    return 'logged';
  }
}
