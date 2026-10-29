import type { ExecutionContext } from '@nestjs/common';
import { ThrottlerException, ThrottlerStorageService } from '@nestjs/throttler';
import {
  INVITE_USER_LIMIT,
  InviteUserThrottleGuard,
} from './invite-user-throttle.guard.js';

function context(userId: string | null, headers: Record<string, unknown>) {
  const req = {
    auth: userId ? { user: { id: userId } } : undefined,
    ip: '203.0.113.1',
  };
  const res = { setHeader: (k: string, v: unknown) => (headers[k] = v) };
  return {
    switchToHttp: () => ({ getRequest: () => req, getResponse: () => res }),
  } as unknown as ExecutionContext;
}

describe('InviteUserThrottleGuard', () => {
  let storage: ThrottlerStorageService;
  afterEach(() => storage.onApplicationShutdown());

  it('blocks one user after the shared limit while other users go through', async () => {
    storage = new ThrottlerStorageService();
    const guard = new InviteUserThrottleGuard(storage);
    const headers: Record<string, unknown> = {};
    for (let i = 0; i < INVITE_USER_LIMIT.COUNT; i++) {
      await expect(guard.canActivate(context('u1', headers))).resolves.toBe(
        true,
      );
    }
    await expect(guard.canActivate(context('u1', headers))).rejects.toThrow(
      ThrottlerException,
    );
    expect(Number(headers['Retry-After'])).toBeGreaterThan(0);
    await expect(guard.canActivate(context('u2', {}))).resolves.toBe(true);
  });

  it('leaves unauthenticated requests to AuthGuard', async () => {
    storage = new ThrottlerStorageService();
    const guard = new InviteUserThrottleGuard(storage);
    await expect(guard.canActivate(context(null, {}))).resolves.toBe(true);
  });
});
