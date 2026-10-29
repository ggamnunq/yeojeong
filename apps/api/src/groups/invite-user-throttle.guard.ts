import {
  Injectable,
  type CanActivate,
  type ExecutionContext,
} from '@nestjs/common';
import {
  InjectThrottlerStorage,
  ThrottlerException,
  type ThrottlerStorage,
} from '@nestjs/throttler';
import type { Request, Response } from 'express';

/**
 * 초대코드 미리보기·참여를 합쳐 사용자당 10분에 20회. 넘으면 그 10분 동안 429 RATE_LIMITED.
 * IP 단위 StrictThrottle(1분 10회, 엔드포인트별)과 함께 걸려, IP를 바꿔 가며 코드를 대입해도 계정 하나로는 이 한도에 막힌다.
 * 정상 사용(미리보기 1 + 참여 1, 오타 몇 번)은 닿지 않는다.
 */
export const INVITE_USER_LIMIT = { COUNT: 20, WINDOW_MS: 10 * 60_000 } as const;

const THROTTLER_NAME = 'invite-user';

/**
 * 전역 가드(Throttler → … → AuthGuard) 다음에 도는 라우트 가드라 req.auth가 채워져 있다.
 * 카운터는 전역 ThrottlerModule과 같은 저장소 = **Cloud Run 인스턴스 메모리**다. 인스턴스끼리 나누지 않으므로
 * 실제 한도는 인스턴스 수만큼 늘어난다(최대 인스턴스 2개 → 사용자당 10분 최대 40회), 인스턴스가 다시 뜨면 0부터 센다.
 * 6자 코드 공간(31^6 ≈ 8.9억)에 비하면 충분해 공유 저장소(DB·Redis)로 옮기지 않았다(W8 보안 리뷰 L3).
 */
@Injectable()
export class InviteUserThrottleGuard implements CanActivate {
  constructor(
    @InjectThrottlerStorage() private readonly storage: ThrottlerStorage,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const http = context.switchToHttp();
    const req = http.getRequest<Request>();
    const userId = req.auth?.user.id;
    // 로그인 필수 라우트라 여기까지 오면 늘 있다. 없으면 AuthGuard가 이미 401로 막았다
    if (!userId) return true;
    const { isBlocked, timeToBlockExpire } = await this.storage.increment(
      `${THROTTLER_NAME}:${userId}`,
      INVITE_USER_LIMIT.WINDOW_MS,
      INVITE_USER_LIMIT.COUNT,
      INVITE_USER_LIMIT.WINDOW_MS,
      THROTTLER_NAME,
    );
    if (isBlocked) {
      http.getResponse<Response>().setHeader('Retry-After', timeToBlockExpire);
      throw new ThrottlerException();
    }
    return true;
  }
}
