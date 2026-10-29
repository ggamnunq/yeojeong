import { request as httpRequest, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { ConfigService } from '@nestjs/config';
import type { NestExpressApplication } from '@nestjs/platform-express';
import request from 'supertest';
import { CLIENT_ERROR_IP_LIMIT_PER_MIN } from './../src/client-errors/client-errors.controller.js';
import {
  CLIENT_ERROR_USER_LIMIT_PER_MIN,
  CLIENT_ERROR_USER_REF_FROM,
} from './../src/client-errors/client-errors.service.js';
import { createLogger } from './../src/common/logging/logger.js';
import { createTestAuth, TEST_ORIGIN, type TestAuth } from './auth-helpers.js';
import { createTestApp } from './create-test-app.js';

const PATH = '/api/client-errors';

const validReport = (overrides: Record<string, unknown> = {}) => ({
  buildId: 'ccd404d9a1b2',
  route: '/trips/:tripId/info',
  source: 'boundary',
  name: 'TypeError',
  message: "Cannot read properties of undefined (reading 'members')",
  stack: ['TripInfoPage-B3x9aQ.js:1:2345', 'index-Cx1.js:12:9', '(external)'],
  userAgent: 'Safari 18 / iOS 18',
  chunk: false,
  staleBuild: true,
  ...overrides,
});

describe('POST /api/client-errors (e2e)', () => {
  let app: NestExpressApplication;
  let auth: TestAuth;
  let lines: Record<string, unknown>[];
  let raw: string;

  beforeEach(async () => {
    lines = [];
    raw = '';
    vi.stubEnv('NODE_ENV', 'production');
    vi.stubEnv('LOG_LEVEL', 'info');
    const logger = createLogger(new ConfigService(), {
      write: (line: string) => {
        raw += line;
        lines.push(JSON.parse(line) as Record<string, unknown>);
      },
    });
    auth = createTestAuth();
    app = await createTestApp([], { auth, logger });
  });

  afterEach(async () => {
    await app.close();
    vi.unstubAllEnvs();
  });

  const clientErrorLines = () =>
    lines.filter((line) => line.event === 'client_error');

  it('받으면 204, severity=WARNING · event=client_error 한 줄(요청 ID 포함). 메시지는 서버가 다시 가린다', async () => {
    const res = await request(app.getHttpServer())
      .post(PATH)
      .set(auth.headers())
      .set('User-Agent', 'Mozilla/5.0 raw-user-agent')
      .send(
        validReport({
          message:
            'pay 4111 1111 1111 1111 by traveler@example.com #code=K7M2QX',
        }),
      )
      .expect(204);

    const [line, ...rest] = clientErrorLines();
    expect(rest).toHaveLength(0);
    expect(line).toEqual({
      severity: 'WARNING',
      time: expect.any(String),
      requestId: res.headers['x-request-id'],
      context: 'ClientErrorsService',
      event: 'client_error',
      buildId: 'ccd404d9a1b2',
      route: '/trips/:tripId/info',
      source: 'boundary',
      errorName: 'TypeError',
      errorMessage: 'pay [CARD] by [EMAIL] #code=[REDACTED]',
      stack: [
        'TripInfoPage-B3x9aQ.js:1:2345',
        'index-Cx1.js:12:9',
        '(external)',
      ],
      // 옛 형식(OS 버전 포함)으로 와도 OS 종류까지만 남긴다
      clientUserAgent: 'Safari 18 / iOS',
      chunk: false,
      staleBuild: true,
      loggedIn: false,
      userRef: null,
      message: 'client_error TypeError /trips/:tripId/info',
    });
    expect(raw).not.toMatch(/4111|traveler|K7M2QX/);
  });

  it.each([
    ['처리방침 0.3 시행 전', CLIENT_ERROR_USER_REF_FROM - 1, false],
    ['시행 시각부터', CLIENT_ERROR_USER_REF_FROM, true],
  ])('로그인 상태: %s userRef %s', async (_, now, withRef) => {
    // Date만 바꾼다(타이머는 그대로)
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(now);
    try {
      const me = auth.addUser();
      await request(app.getHttpServer())
        .post(PATH)
        .set(auth.headers(me))
        .send(validReport({ staleBuild: undefined }))
        .expect(204);
      const [line] = clientErrorLines();
      expect(line.loggedIn).toBe(true);
      if (withRef) expect(line.userRef).toMatch(/^[0-9a-f]{16}$/);
      else expect(line.userRef).toBeNull();
      expect(line.staleBuild).toBeNull();
      expect(raw).not.toContain(me.id);
    } finally {
      vi.useRealTimers();
    }
  });

  it('Origin이 없거나 다른 곳이면 403 CSRF_REJECTED(로그 없음)', async () => {
    await request(app.getHttpServer())
      .post(PATH)
      .send(validReport())
      .expect(403);
    const res = await request(app.getHttpServer())
      .post(PATH)
      .set('Origin', 'https://evil.example')
      .send(validReport())
      .expect(403);
    expect(res.body.code).toBe('CSRF_REJECTED');
    // 같은 origin fetch(Origin 없이 Sec-Fetch-Site만 있는 브라우저)도 받는다
    await request(app.getHttpServer())
      .post(PATH)
      .set('Sec-Fetch-Site', 'same-origin')
      .send(validReport())
      .expect(204);
    expect(clientErrorLines()).toHaveLength(1);
  });

  it.each([
    ['실제 경로·쿼리가 실린 route', { route: '/trips/3f2b?x=1' }],
    ['해시가 실린 route', { route: '/join#code=K7M2QX' }],
    [
      '파일 경로·쿼리가 실린 스택',
      { stack: ['https://x.com/a.js?token=1:1:1'] },
    ],
    ['스택 9줄', { stack: Array.from({ length: 9 }, () => 'a.js:1:1') }],
    ['501자 메시지', { message: 'x'.repeat(501) }],
    [
      '원문 User-Agent',
      { userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_6 like Mac OS X)' },
    ],
    ['모르는 source', { source: 'console' }],
    ['모르는 필드', { email: 'a@b.c' }],
    ['이상한 이름', { name: '<script>' }],
    ['이상한 빌드 ID', { buildId: '../../etc' }],
  ])('%s → 400(로그 없음)', async (_, overrides) => {
    const res = await request(app.getHttpServer())
      .post(PATH)
      .set(auth.headers())
      .send(validReport(overrides))
      .expect(400);
    expect(res.body.code).toBe('VALIDATION_FAILED');
    expect(clientErrorLines()).toHaveLength(0);
  });

  it('본문 8KB 초과는 읽지 않고 413 PAYLOAD_TOO_LARGE', async () => {
    const res = await request(app.getHttpServer())
      .post(PATH)
      .set(auth.headers())
      .set('Content-Type', 'application/json')
      .send(JSON.stringify({ ...validReport(), pad: 'x'.repeat(9 * 1024) }))
      .expect(413);
    expect(res.body.code).toBe('PAYLOAD_TOO_LARGE');
    expect(clientErrorLines()).toHaveLength(0);
    // 요청 로그에는 남는다(경고)
    expect(lines).toContainEqual(
      expect.objectContaining({
        path: PATH,
        status: 413,
        errorCode: 'PAYLOAD_TOO_LARGE',
      }),
    );
  });

  it.each(['/api/client-errors/', '/API/Client-Errors'])(
    '경로 표기가 달라도(%s) 같은 8KB 상한',
    async (path) => {
      await request(app.getHttpServer())
        .post(path)
        .set(auth.headers())
        .set('Content-Type', 'application/json')
        .send(JSON.stringify({ ...validReport(), pad: 'x'.repeat(9 * 1024) }))
        .expect(413);
    },
  );

  /** Content-Length 없이 chunked로 보낸다(Cloudflare Worker가 본문 스트림을 그대로 넘기는 경우) */
  async function postChunked(chunks: string[]) {
    const server = app.getHttpServer() as Server;
    if (!server.listening) await new Promise<void>((r) => server.listen(0, r));
    const { port } = server.address() as AddressInfo;
    return new Promise<{ status: number; body: string }>((resolve, reject) => {
      const req = httpRequest(
        {
          port,
          method: 'POST',
          path: PATH,
          headers: {
            'content-type': 'application/json',
            'transfer-encoding': 'chunked',
            origin: TEST_ORIGIN,
          },
        },
        (res) => {
          let body = '';
          res.on('data', (chunk: Buffer) => (body += chunk.toString()));
          res.on('end', () => resolve({ status: res.statusCode ?? 0, body }));
        },
      );
      req.on('error', (error) => {
        // 상한을 넘으면 서버가 응답 후 연결을 끊을 수 있다
        if ((error as NodeJS.ErrnoException).code === 'EPIPE') return;
        reject(error);
      });
      for (const chunk of chunks) req.write(chunk);
      req.end();
    });
  }

  it('Worker 경유처럼 chunked(Content-Length 없음)로 온 정상 보고도 받는다', async () => {
    const json = JSON.stringify(validReport());
    const res = await postChunked([json.slice(0, 50), json.slice(50)]);
    expect(res.status).toBe(204);
    expect(clientErrorLines()).toHaveLength(1);
  });

  it('chunked 본문도 8KB를 넘으면 413 PAYLOAD_TOO_LARGE', async () => {
    const json = JSON.stringify({
      ...validReport(),
      pad: 'x'.repeat(9 * 1024),
    });
    const res = await postChunked(json.match(/[\s\S]{1,1024}/g) ?? []);
    expect(res.status).toBe(413);
    expect(JSON.parse(res.body)).toMatchObject({ code: 'PAYLOAD_TOO_LARGE' });
    expect(clientErrorLines()).toHaveLength(0);
  });

  it(`IP당 1분 ${CLIENT_ERROR_IP_LIMIT_PER_MIN}회를 넘으면 429`, async () => {
    for (let i = 0; i < CLIENT_ERROR_IP_LIMIT_PER_MIN; i++) {
      await request(app.getHttpServer())
        .post(PATH)
        .set('Origin', TEST_ORIGIN)
        .send(validReport())
        .expect(204);
    }
    const res = await request(app.getHttpServer())
      .post(PATH)
      .set('Origin', TEST_ORIGIN)
      .send(validReport())
      .expect(429);
    expect(res.body.code).toBe('RATE_LIMITED');
  });

  it(`사용자당 1분 ${CLIENT_ERROR_USER_LIMIT_PER_MIN}회를 넘으면 429`, async () => {
    const me = auth.addUser();
    for (let i = 0; i < CLIENT_ERROR_USER_LIMIT_PER_MIN; i++) {
      await request(app.getHttpServer())
        .post(PATH)
        .set(auth.headers(me))
        .send(validReport())
        .expect(204);
    }
    const res = await request(app.getHttpServer())
      .post(PATH)
      .set(auth.headers(me))
      .send(validReport())
      .expect(429);
    expect(res.body.code).toBe('RATE_LIMITED');
    expect(clientErrorLines()).toHaveLength(CLIENT_ERROR_USER_LIMIT_PER_MIN);
  });
});
