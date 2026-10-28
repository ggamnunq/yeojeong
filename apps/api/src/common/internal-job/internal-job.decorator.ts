import { SetMetadata, applyDecorators } from '@nestjs/common';
import { Public } from '../auth/decorators.js';
import { IS_INTERNAL_JOB_KEY } from './internal-job.constants.js';

/**
 * Cloud Scheduler가 호출하는 내부 잡 라우트.
 * 로그인·CSRF는 건너뛰지만 InternalJobGuard의 OIDC 검증은 반드시 통과해야 한다.
 */
export const InternalJob = () =>
  applyDecorators(Public(), SetMetadata(IS_INTERNAL_JOB_KEY, true));
