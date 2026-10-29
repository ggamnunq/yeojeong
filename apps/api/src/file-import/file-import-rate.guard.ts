import {
  Injectable,
  type CanActivate,
  type ExecutionContext,
} from '@nestjs/common';
import {
  InjectThrottlerStorage,
  seconds,
  type ThrottlerStorage,
} from '@nestjs/throttler';
import { FILE_IMPORT_SAVE_LIMIT } from '@yeojeong/shared';
import type { Request } from 'express';
import { AppException } from '../common/errors/index.js';

/**
 * 파일 가져오기 저장의 **사용자 ID 기준** 호출 제한(FILE_IMPORT_SAVE_LIMIT, 1분 5회). IP 기준 @Throttle과 따로 센다
 * (같은 IP 뒤 여러 사용자·여러 IP를 쓰는 한 사용자 모두 막는다). 전역 Throttler 저장소(인스턴스 메모리)를 같이 쓴다.
 * 전역 AuthGuard 뒤에 돌아 req.auth가 있다. 넘으면 429 FILE_IMPORT_RATE_LIMITED { retryAfter, retryAfterSec } + Retry-After
 */
@Injectable()
export class FileImportRateGuard implements CanActivate {
  constructor(
    @InjectThrottlerStorage() private readonly storage: ThrottlerStorage,
  ) {}

  async canActivate(ctx: ExecutionContext): Promise<boolean> {
    const req = ctx.switchToHttp().getRequest<Request>();
    const userId = req.auth?.user.id;
    if (!userId) return true;
    const ttl = seconds(FILE_IMPORT_SAVE_LIMIT.WINDOW_SECONDS);
    const record = await this.storage.increment(
      `file-import-save:${userId}`,
      ttl,
      FILE_IMPORT_SAVE_LIMIT.COUNT,
      ttl,
      'file-import-save',
    );
    if (record.isBlocked || record.totalHits > FILE_IMPORT_SAVE_LIMIT.COUNT) {
      const retryAfterSec = Math.max(
        1,
        Math.ceil(
          record.isBlocked ? record.timeToBlockExpire : record.timeToExpire,
        ),
      );
      throw AppException.of('FILE_IMPORT_RATE_LIMITED', {
        details: {
          retryAfter: new Date(Date.now() + retryAfterSec * 1000).toISOString(),
          retryAfterSec,
        },
      });
    }
    return true;
  }
}
