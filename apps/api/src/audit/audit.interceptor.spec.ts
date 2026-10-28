import {
  Logger,
  type CallHandler,
  type ExecutionContext,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { firstValueFrom, of, throwError } from 'rxjs';
import { AuditInterceptor } from './audit.interceptor.js';
import type { AuditService } from './audit.service.js';
import { Audited, fromCurrentUser, fromParam } from './audited.decorator.js';

const USER_ID = '0b9d3c1a-2e4f-4a6b-8c0d-1e2f3a4b5c6d';
const EXPENSE_ID = '6f1c2d3e-4a5b-4c7d-8e9f-0a1b2c3d4e5f';

class Probe {
  @Audited('VIEW_EXPENSE_DETAIL', {
    resourceType: 'EXPENSE',
    resourceId: fromParam('expenseId'),
  })
  detail() {}

  @Audited('DELETE_ACCOUNT', {
    resourceType: 'USER',
    resourceId: fromCurrentUser,
  })
  deleteMe() {}

  plain() {}
}

function context(
  handler: keyof Probe,
  req: Record<string, unknown>,
): ExecutionContext {
  return {
    getType: () => 'http',
    getHandler: () => Probe.prototype[handler],
    getClass: () => Probe,
    switchToHttp: () => ({ getRequest: () => req }),
  } as unknown as ExecutionContext;
}

const authed = (params: Record<string, string> = {}) => ({
  auth: { user: { id: USER_ID } },
  params,
  ip: '203.0.113.7',
});

describe('AuditInterceptor', () => {
  let record: ReturnType<typeof vi.fn>;
  let interceptor: AuditInterceptor;
  const ok: CallHandler = {
    handle: () => of({ merchant: '이치란', amount: 36400 }),
  };

  beforeAll(() => Logger.overrideLogger(false));
  beforeEach(() => {
    record = vi.fn().mockResolvedValue('log-1');
    interceptor = new AuditInterceptor(new Reflector(), {
      record,
    } as unknown as AuditService);
  });

  it('does nothing on routes without @Audited()', async () => {
    await firstValueFrom(interceptor.intercept(context('plain', authed()), ok));
    expect(record).not.toHaveBeenCalled();
  });

  it('records IDs only after the handler succeeds and passes the body through', async () => {
    const body = await firstValueFrom(
      interceptor.intercept(
        context('detail', authed({ expenseId: EXPENSE_ID })),
        ok,
      ),
    );
    expect(body).toEqual({ merchant: '이치란', amount: 36400 });
    expect(record).toHaveBeenCalledWith({
      userId: USER_ID,
      action: 'VIEW_EXPENSE_DETAIL',
      resourceType: 'EXPENSE',
      resourceId: EXPENSE_ID,
      ip: '203.0.113.7',
    });
  });

  it('can target the current user (탈퇴)', async () => {
    await firstValueFrom(
      interceptor.intercept(context('deleteMe', authed()), ok),
    );
    expect(record).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'DELETE_ACCOUNT',
        resourceId: USER_ID,
      }),
    );
  });

  it('skips failed requests and anonymous requests', async () => {
    const failing: CallHandler = {
      handle: () => throwError(() => new Error('404')),
    };
    await expect(
      firstValueFrom(
        interceptor.intercept(context('detail', authed()), failing),
      ),
    ).rejects.toThrow('404');
    await firstValueFrom(
      interceptor.intercept(context('detail', { params: {} }), ok),
    );
    expect(record).not.toHaveBeenCalled();
  });

  it('still answers when writing the log fails', async () => {
    record.mockRejectedValueOnce(new Error('db down'));
    await expect(
      firstValueFrom(interceptor.intercept(context('detail', authed()), ok)),
    ).resolves.toEqual({ merchant: '이치란', amount: 36400 });
  });
});
