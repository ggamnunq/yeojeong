import type { ArgumentsHost } from '@nestjs/common';
import {
  MethodNotAllowedException,
  UnauthorizedException,
} from '@nestjs/common';
import { ThrottlerException } from '@nestjs/throttler';
import { ERRORS } from '@yeojeong/shared';
import type { PinoLogger } from 'nestjs-pino';
import { Prisma } from '../../generated/prisma/client.js';
import { AllExceptionsFilter } from './all-exceptions.filter.js';
import { AppException, NotFoundError } from './app-exception.js';

function prismaError(code: string) {
  return new Prisma.PrismaClientKnownRequestError(
    'Unique constraint failed on the fields: (`email`)',
    {
      code,
      clientVersion: '7.10.1',
      meta: { modelName: 'User', target: ['email'] },
    },
  );
}

describe('AllExceptionsFilter', () => {
  const log = { error: vi.fn(), warn: vi.fn() };
  let res: {
    locals: Record<string, unknown>;
    headersSent: boolean;
    status: ReturnType<typeof vi.fn>;
    json: ReturnType<typeof vi.fn>;
    end: ReturnType<typeof vi.fn>;
  };
  const filter = new AllExceptionsFilter(log as unknown as PinoLogger);

  function catchError(exception: unknown) {
    const req = { id: 'req-1', log };
    const host = {
      switchToHttp: () => ({ getRequest: () => req, getResponse: () => res }),
    } as unknown as ArgumentsHost;
    filter.catch(exception, host);
    return {
      status: res.status.mock.lastCall?.[0] as number,
      body: res.json.mock.lastCall?.[0] as Record<string, unknown>,
    };
  }

  beforeEach(() => {
    log.error.mockReset();
    log.warn.mockReset();
    res = {
      locals: {},
      headersSent: false,
      status: vi.fn().mockImplementation(() => res),
      json: vi.fn(),
      end: vi.fn(),
    };
  });

  describe('Prisma errors', () => {
    it('maps P2002 to 409 CONFLICT without the DB message', () => {
      const { status, body } = catchError(prismaError('P2002'));

      expect(status).toBe(409);
      expect(body).toEqual({
        code: 'CONFLICT',
        message: ERRORS.CONFLICT.message,
        requestId: 'req-1',
      });
      expect(log.warn).toHaveBeenCalledWith(
        expect.objectContaining({ prismaCode: 'P2002', model: 'User' }),
        expect.any(String),
      );
      expect(log.error).not.toHaveBeenCalled();
    });

    it('maps P2025 to 404 NOT_FOUND', () => {
      const { status, body } = catchError(prismaError('P2025'));
      expect(status).toBe(404);
      expect(body.code).toBe('NOT_FOUND');
    });

    it('treats other known errors as 500 and keeps meta out of the log', () => {
      const { status, body } = catchError(prismaError('P2003'));

      expect(status).toBe(500);
      expect(body).toEqual({
        code: 'INTERNAL_ERROR',
        message: ERRORS.INTERNAL_ERROR.message,
        requestId: 'req-1',
      });
      const [fields] = log.error.mock.calls[0] as [Record<string, unknown>];
      expect(fields).toMatchObject({ prismaCode: 'P2003', status: 500 });
      expect(fields.err).not.toHaveProperty('meta');
    });

    it('treats a validation error (bad query) as 500', () => {
      const { status, body } = catchError(
        new Prisma.PrismaClientValidationError('Argument `email` is missing.', {
          clientVersion: '7.10.1',
        }),
      );
      expect(status).toBe(500);
      expect(body.code).toBe('INTERNAL_ERROR');
    });
  });

  it('hides the message of unexpected errors and logs them as errors', () => {
    const error = new Error('connect ECONNREFUSED 10.0.0.1:5432');
    const { status, body } = catchError(error);

    expect(status).toBe(500);
    expect(JSON.stringify(body)).not.toContain('ECONNREFUSED');
    expect(log.error).toHaveBeenCalledWith(
      expect.objectContaining({ err: error, errorCode: 'INTERNAL_ERROR' }),
      expect.any(String),
    );
  });

  it.each([
    [new UnauthorizedException(), 401, 'UNAUTHENTICATED'],
    [new MethodNotAllowedException(), 405, 'METHOD_NOT_ALLOWED'],
    [new ThrottlerException(), 429, 'RATE_LIMITED'],
    [
      Object.assign(new Error('request entity too large'), {
        status: 413,
        expose: true,
        type: 'entity.too.large',
      }),
      413,
      'PAYLOAD_TOO_LARGE',
    ],
  ])('maps %s to %i %s', (exception, expectedStatus, expectedCode) => {
    const { status, body } = catchError(exception);
    expect(status).toBe(expectedStatus);
    expect(body).toEqual({
      code: expectedCode,
      message: ERRORS[expectedCode as keyof typeof ERRORS].message,
      requestId: 'req-1',
    });
    expect(log.error).not.toHaveBeenCalled();
  });

  it('passes AppException message and details through', () => {
    const { status, body } = catchError(
      AppException.of('CONFLICT', {
        message: '이미 정산이 끝난 여정이에요',
        details: { settledAt: '2026-10-28' },
      }),
    );
    expect(status).toBe(409);
    expect(body).toEqual({
      code: 'CONFLICT',
      message: '이미 정산이 끝난 여정이에요',
      details: { settledAt: '2026-10-28' },
      requestId: 'req-1',
    });
    expect(catchError(new NotFoundError()).body.code).toBe('NOT_FOUND');
  });

  it('records the code for the request log and ends a response already sent', () => {
    res.headersSent = true;
    catchError(new Error('stream failed'));
    expect(res.locals.errorCode).toBe('INTERNAL_ERROR');
    expect(res.json).not.toHaveBeenCalled();
    expect(res.end).toHaveBeenCalled();
  });
});
