import {
  Body,
  Controller,
  Get,
  Post,
  UseGuards,
  type CanActivate,
} from '@nestjs/common';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { ERRORS } from '@yeojeong/shared';
import { Type } from 'class-transformer';
import {
  IsInt,
  IsString,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';
import request from 'supertest';
import { Public } from './../src/common/auth/index.js';
import { AppException } from './../src/common/errors/index.js';
import { StrictThrottle } from './../src/common/throttle.js';
import { Prisma } from './../src/generated/prisma/client.js';
import { TEST_ORIGIN } from './auth-helpers.js';
import { createTestApp } from './create-test-app.js';

const UUID_V4 =
  /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

class ItemDto {
  @IsString()
  name: string;

  @IsInt()
  @Min(1)
  amount: number;
}

class CreateExpenseDto {
  @IsString()
  @MaxLength(10)
  title: string;

  @IsInt()
  @Min(0)
  amount: number;

  @ValidateNested({ each: true })
  @Type(() => ItemDto)
  items: ItemDto[];
}

class DenyGuard implements CanActivate {
  canActivate() {
    return false;
  }
}

// 테스트에서만 등록하는 컨트롤러. 운영 코드에는 이런 라우트를 두지 않는다.
@Public()
@Controller('error-probe')
class ErrorProbeController {
  @Post('expenses')
  create(@Body() dto: CreateExpenseDto) {
    return dto;
  }

  @Get('boom')
  boom(): never {
    throw new Error('password=hunter2 internal detail');
  }

  @Get('app')
  app(): never {
    throw AppException.of('CONFLICT', {
      message: '이미 정산이 끝난 여정이에요',
      details: { settledAt: '2026-10-28' },
    });
  }

  @UseGuards(DenyGuard)
  @Get('guarded')
  guarded() {
    return { ok: true };
  }

  @Get('duplicate')
  duplicate(): never {
    throw new Prisma.PrismaClientKnownRequestError(
      'Unique constraint failed on the fields: (`email`)',
      { code: 'P2002', clientVersion: '7.10.1', meta: { target: ['email'] } },
    );
  }

  @StrictThrottle()
  @Get('strict')
  strict() {
    return { ok: true };
  }
}

function expectNoLeak(text: string) {
  expect(text).not.toMatch(
    /node_modules|\s+at\s|internal detail|hunter2|stack|Cannot GET|Unique constraint|email/i,
  );
}

describe('Error responses (e2e)', () => {
  let app: NestExpressApplication;

  beforeEach(async () => {
    app = await createTestApp([ErrorProbeController]);
  });

  afterEach(async () => {
    await app.close();
  });

  it('collects every field error on validation failure', async () => {
    const res = await request(app.getHttpServer())
      .post('/api/error-probe/expenses')
      .set('Origin', TEST_ORIGIN)
      .send({
        title: '오사카 3박 4일 맛집 투어',
        amount: -1,
        items: [{ name: 1, amount: 0 }],
        isAdmin: true,
      })
      .expect(400);

    expect(res.body).toMatchObject({
      code: 'VALIDATION_FAILED',
      message: ERRORS.VALIDATION_FAILED.message,
      requestId: res.headers['x-request-id'],
    });
    const fields = res.body.details.fields as Record<string, unknown>[];
    expect(fields).toEqual(
      expect.arrayContaining(
        [
          { path: 'title', code: 'maxLength' },
          { path: 'amount', code: 'min' },
          { path: 'items.0.name', code: 'isString' },
          { path: 'items.0.amount', code: 'min' },
          { path: 'isAdmin', code: 'whitelistValidation' },
        ].map((field) =>
          expect.objectContaining({ ...field, message: expect.any(String) }),
        ),
      ),
    );
  });

  it('returns 404 for unknown routes', async () => {
    const res = await request(app.getHttpServer())
      .get('/api/does-not-exist')
      .expect(404);
    expect(res.body).toEqual({
      code: 'NOT_FOUND',
      message: ERRORS.NOT_FOUND.message,
      requestId: res.headers['x-request-id'],
    });
    expectNoLeak(res.text);
  });

  it('returns 400 for malformed JSON', async () => {
    const res = await request(app.getHttpServer())
      .post('/api/error-probe/expenses')
      .set('Origin', TEST_ORIGIN)
      .set('Content-Type', 'application/json')
      .send('{"title": ')
      .expect(400);
    expect(res.body).toEqual({
      code: 'BAD_REQUEST',
      message: ERRORS.BAD_REQUEST.message,
      requestId: res.headers['x-request-id'],
    });
    expectNoLeak(res.text);
  });

  it('returns 413 for bodies over the limit', async () => {
    const res = await request(app.getHttpServer())
      .post('/api/error-probe/expenses')
      .set('Origin', TEST_ORIGIN)
      .send({ title: 'x'.repeat(200 * 1024) })
      .expect(413);
    expect(res.body).toEqual({
      code: 'PAYLOAD_TOO_LARGE',
      message: ERRORS.PAYLOAD_TOO_LARGE.message,
      requestId: res.headers['x-request-id'],
    });
  });

  it('returns 429 once the limit is exceeded', async () => {
    const server = app.getHttpServer();
    for (let i = 0; i < 10; i++) {
      await request(server).get('/api/error-probe/strict').expect(200);
    }
    const res = await request(server)
      .get('/api/error-probe/strict')
      .expect(429);
    expect(res.body).toEqual({
      code: 'RATE_LIMITED',
      message: ERRORS.RATE_LIMITED.message,
      requestId: res.headers['x-request-id'],
    });
    expect(res.headers['retry-after']).toBeDefined();
  });

  it('returns only a generic message on 500', async () => {
    const res = await request(app.getHttpServer())
      .get('/api/error-probe/boom')
      .expect(500);
    expect(res.headers['x-request-id']).toMatch(UUID_V4);
    expect(res.body).toEqual({
      code: 'INTERNAL_ERROR',
      message: ERRORS.INTERNAL_ERROR.message,
      requestId: res.headers['x-request-id'],
    });
    expectNoLeak(res.text);
  });

  it('passes AppException code, message and details through', async () => {
    const res = await request(app.getHttpServer())
      .get('/api/error-probe/app')
      .expect(409);
    expect(res.body).toEqual({
      code: 'CONFLICT',
      message: '이미 정산이 끝난 여정이에요',
      details: { settledAt: '2026-10-28' },
      requestId: res.headers['x-request-id'],
    });
  });

  it('maps Nest exceptions such as a guard rejection', async () => {
    const res = await request(app.getHttpServer())
      .get('/api/error-probe/guarded')
      .expect(403);
    expect(res.body).toEqual({
      code: 'FORBIDDEN',
      message: ERRORS.FORBIDDEN.message,
      requestId: res.headers['x-request-id'],
    });
  });

  it('maps a Prisma unique violation to 409 without the DB message', async () => {
    const res = await request(app.getHttpServer())
      .get('/api/error-probe/duplicate')
      .expect(409);
    expect(res.body).toEqual({
      code: 'CONFLICT',
      message: ERRORS.CONFLICT.message,
      requestId: res.headers['x-request-id'],
    });
    expectNoLeak(res.text);
  });

  it('ignores a client supplied x-request-id', async () => {
    const res = await request(app.getHttpServer())
      .get('/api/health')
      .set('X-Request-Id', 'forged-request-id')
      .expect(200);
    expect(res.headers['x-request-id']).toMatch(UUID_V4);
  });
});
