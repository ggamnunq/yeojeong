import { seconds, Throttle, type ThrottlerOptions } from '@nestjs/throttler';

// 모든 엔드포인트에 걸리는 기본값: 클라이언트 IP당 1분에 120회
export const DEFAULT_THROTTLE: ThrottlerOptions = {
  name: 'default',
  ttl: seconds(60),
  limit: 120,
};

// 로그인, 인증번호 확인처럼 무차별 대입 대상이 되는 엔드포인트에 붙인다.
export const StrictThrottle = () =>
  Throttle({ default: { ttl: seconds(60), limit: 10 } });
