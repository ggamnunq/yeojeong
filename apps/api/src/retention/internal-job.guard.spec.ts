import type { ExecutionContext } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { AppException } from '../common/errors/index.js';
import {
  INTERNAL_JOB_SECRET_HEADER,
  InternalJobGuard,
} from './internal-job.guard.js';

const SECRET = 's'.repeat(40);

function context(headers: Record<string, string>): ExecutionContext {
  return {
    switchToHttp: () => ({ getRequest: () => ({ headers }) }),
  } as unknown as ExecutionContext;
}

function guard(env: Record<string, string>) {
  return new InternalJobGuard(new ConfigService(env));
}

function forbidden(fn: () => unknown) {
  try {
    fn();
  } catch (err) {
    return err instanceof AppException && err.getStatus() === 403;
  }
  return false;
}

describe('InternalJobGuard', () => {
  it('lets the right secret through', () => {
    expect(
      guard({ INTERNAL_JOB_SECRET: SECRET }).canActivate(
        context({ [INTERNAL_JOB_SECRET_HEADER]: SECRET }),
      ),
    ).toBe(true);
  });

  it('answers 403 for a missing or wrong secret', () => {
    const g = guard({ INTERNAL_JOB_SECRET: SECRET });
    expect(forbidden(() => g.canActivate(context({})))).toBe(true);
    expect(
      forbidden(() =>
        g.canActivate(context({ [INTERNAL_JOB_SECRET_HEADER]: `${SECRET}x` })),
      ),
    ).toBe(true);
  });

  it('blocks every call when the secret is not configured', () => {
    expect(
      forbidden(() =>
        guard({}).canActivate(context({ [INTERNAL_JOB_SECRET_HEADER]: '' })),
      ),
    ).toBe(true);
  });

  it('refuses a short secret at boot', () => {
    expect(() => guard({ INTERNAL_JOB_SECRET: 'short' })).toThrow(/32자/);
  });
});
