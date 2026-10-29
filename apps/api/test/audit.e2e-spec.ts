import { randomUUID } from 'node:crypto';
import { Controller, Get, NotFoundException, Param } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { NestExpressApplication } from '@nestjs/platform-express';
import request from 'supertest';
import { Audited, fromParam } from './../src/audit/index.js';
import { Public } from './../src/common/auth/index.js';
import { createLogger } from './../src/common/logging/logger.js';
import { PrismaService } from './../src/prisma/prisma.service.js';
import { describeWithDb } from './account-fixtures.js';
import { createTestAuth } from './auth-helpers.js';
import { createTestApp } from './create-test-app.js';

// 결제 상세처럼 민감한 응답을 돌려주는 가짜 라우트. 감사 로그에는 ID만 남아야 한다.
@Controller('audit-probe')
class AuditProbeController {
  @Audited('VIEW_EXPENSE_DETAIL', {
    resourceType: 'EXPENSE',
    resourceId: fromParam('expenseId'),
  })
  @Get('expenses/:expenseId')
  detail(@Param('expenseId') expenseId: string) {
    return {
      id: expenseId,
      merchantName: '이치란 라멘 도톤보리',
      krwAmount: 36_400,
      maskedNumber: '5365-****-****-1934',
    };
  }

  @Audited('VIEW_EXPENSE_DETAIL', {
    resourceType: 'EXPENSE',
    resourceId: fromParam('expenseId'),
  })
  @Get('missing/:expenseId')
  missing() {
    throw new NotFoundException();
  }

  @Get('plain/:expenseId')
  plain() {
    return { ok: true };
  }

  @Public()
  @Audited('LIST_EXPENSES', { resourceType: 'TRIP' })
  @Get('public')
  open() {
    return { ok: true };
  }
}

const AUDIT_KEY = 'audit-hmac-key-for-e2e-only-0123456789abcdef';

describeWithDb('감사 로그 @Audited() (e2e, 실제 DB)', () => {
  let app: NestExpressApplication;
  let db: PrismaService;
  const auth = createTestAuth();
  const lines: Record<string, unknown>[] = [];
  let raw = '';

  beforeAll(async () => {
    vi.stubEnv('AUDIT_HMAC_KEY', AUDIT_KEY);
    vi.stubEnv('NODE_ENV', 'production');
    vi.stubEnv('LOG_LEVEL', 'info');
    const logger = createLogger(new ConfigService(), {
      write: (line: string) => {
        raw += line;
        lines.push(JSON.parse(line) as Record<string, unknown>);
      },
    });
    app = await createTestApp([AuditProbeController], {
      auth,
      prisma: 'real',
      logger,
    });
    db = app.get(PrismaService);
  });

  afterAll(async () => {
    await app.close();
    vi.unstubAllEnvs();
  });

  it('records who viewed which expense and when — IDs only', async () => {
    const me = auth.addUser({ nickname: '준용' });
    const expenseId = randomUUID();
    const res = await request(app.getHttpServer())
      .get(`/api/audit-probe/expenses/${expenseId}`)
      .set(auth.headers(me))
      .set('User-Agent', 'yeojeong-e2e')
      .expect(200);
    const requestId = res.headers['x-request-id'] as string;

    const rows = await db.accessLog.findMany({ where: { userId: me.id } });
    expect(rows).toHaveLength(1);
    const row = rows[0];
    expect(row).toMatchObject({
      userId: me.id,
      action: 'VIEW_EXPENSE_DETAIL',
      resourceType: 'EXPENSE',
      resourceId: expenseId,
      ipHash: expect.stringMatching(/^[0-9a-f]{64}$/),
      requestId,
      ua: 'yeojeong-e2e',
    });
    expect(row.at).toBeInstanceOf(Date);
    // 행에는 ID·행위·시각·IP 해시 칸(+ 숫자 요약 details)만 있고 응답 내용(가맹점·금액·카드번호)·IP 원문·닉네임은 없다
    expect(row.details).toBeNull();
    expect(Object.keys(row).sort()).toEqual([
      'action',
      'at',
      'createdAt',
      'details',
      'id',
      'ipHash',
      'requestId',
      'resourceId',
      'resourceType',
      'ua',
      'updatedAt',
      'userId',
    ]);
    expect(JSON.stringify(row)).not.toMatch(
      /이치란|\*\*\*\*|127\.0\.0\.1|::1|준용/,
    );

    // requestId·user-agent는 같은 요청의 애플리케이션 로그로 잇는다(accessLogId)
    expect(lines).toContainEqual(
      expect.objectContaining({
        requestId,
        message: '접근 기록',
        accessLogId: row.id,
        action: 'VIEW_EXPENSE_DETAIL',
        resourceId: expenseId,
      }),
    );
    expect(lines).toContainEqual(
      expect.objectContaining({ requestId, userAgent: 'yeojeong-e2e' }),
    );
    expect(raw).not.toMatch(/이치란|5365-\*{4}|"krwAmount"/);
  });

  it('records nothing for routes without metadata, failed requests or anonymous calls', async () => {
    const me = auth.addUser();
    const server = app.getHttpServer();
    await request(server)
      .get(`/api/audit-probe/plain/${randomUUID()}`)
      .set(auth.headers(me))
      .expect(200);
    await request(server)
      .get(`/api/audit-probe/missing/${randomUUID()}`)
      .set(auth.headers(me))
      .expect(404);
    await request(server).get('/api/audit-probe/public').expect(200);

    expect(await db.accessLog.count({ where: { userId: me.id } })).toBe(0);
  });

  it('stores NULL instead of a path value that is not a UUID', async () => {
    const me = auth.addUser();
    await request(app.getHttpServer())
      .get('/api/audit-probe/expenses/not-a-uuid')
      .set(auth.headers(me))
      .expect(200);
    const [row] = await db.accessLog.findMany({ where: { userId: me.id } });
    expect(row.resourceId).toBeNull();
  });
});
