import type { NestExpressApplication } from '@nestjs/platform-express';
import { ERRORS } from '@yeojeong/shared';
import request from 'supertest';
import {
  KakaoClient,
  KakaoError,
  type KakaoProfile,
} from './../src/auth/kakao/kakao.client.js';
import { TEST_ORIGIN } from './auth-helpers.js';
import { createTestApp } from './create-test-app.js';
import {
  createFakeAuthPrisma,
  type FakeAuthPrisma,
} from './fakes/fake-auth-prisma.js';

class FakeKakao extends KakaoClient {
  profile: KakaoProfile = {
    id: '4001234567',
    nickname: '준용 카카오 닉네임이 꽤 길어요',
    profileImageUrl: 'https://k.kakaocdn.net/dn/profile.jpg',
  };
  error?: KakaoError;
  codes: string[] = [];

  authorizeUrl(state: string) {
    return `https://kauth.kakao.com/oauth/authorize?response_type=code&state=${state}`;
  }

  fetchProfile(code: string) {
    this.codes.push(code);
    return this.error
      ? Promise.reject(this.error)
      : Promise.resolve({ ...this.profile });
  }
}

const AGREEMENTS = [
  { consentId: 'TOS', version: '0.1-draft', agreed: true },
  { consentId: 'PRIVACY', version: '0.1-draft', agreed: true },
  { consentId: 'AGE14', version: '0.1-draft', agreed: true },
];

function cookies(res: request.Response): Record<string, string> {
  const raw = res.headers['set-cookie'] as unknown as string[] | undefined;
  return Object.fromEntries(
    (raw ?? []).map((line) => [line.split('=')[0], line]),
  );
}

function cookieValue(line: string) {
  return line.split(';')[0];
}

describe('Auth (e2e)', () => {
  let app: NestExpressApplication;
  let db: FakeAuthPrisma;
  let kakao: FakeKakao;

  async function start(prisma = db) {
    app = await createTestApp([], {
      auth: 'real',
      prisma,
      overrides: [[KakaoClient, kakao]],
    });
    return request.agent(app.getHttpServer());
  }

  /** 카카오 로그인 왕복. 돌려준 agent에 쿠키가 쌓인다 */
  async function loginWithKakao(
    agent: ReturnType<typeof request.agent>,
    returnTo?: string,
  ) {
    const started = await agent
      .get('/api/auth/kakao/start')
      .query(returnTo ? { returnTo } : {})
      .expect(302);
    const state = new URL(started.headers.location).searchParams.get('state');
    return agent
      .get('/api/auth/kakao/callback')
      .query({ code: 'kakao-code', state })
      .expect(302);
  }

  async function signup(agent: ReturnType<typeof request.agent>) {
    await loginWithKakao(agent);
    return agent
      .post('/api/auth/signup')
      .set('Origin', TEST_ORIGIN)
      .send({ nickname: '준용', agreements: AGREEMENTS, method: 'ALL' })
      .expect(201);
  }

  beforeEach(() => {
    db = createFakeAuthPrisma();
    kakao = new FakeKakao();
  });

  afterEach(async () => {
    await app.close();
  });

  it('redirects to Kakao with a signed state cookie (both paths)', async () => {
    const agent = await start();
    for (const path of ['/api/auth/kakao/start', '/api/auth/kakao']) {
      const res = await agent.get(path).expect(302);
      expect(res.headers.location).toMatch(
        /^https:\/\/kauth\.kakao\.com\/oauth\/authorize\?/,
      );
      const state = new URL(res.headers.location).searchParams.get('state');
      expect(state).toMatch(/^[A-Za-z0-9_-]{43}$/);
      const oauth = cookies(res).yj_oauth;
      expect(oauth).toMatch(/HttpOnly/);
      expect(oauth).toMatch(/SameSite=Lax/);
      expect(oauth).toMatch(/Path=\/api\/auth\/kakao;/);
      expect(oauth).toMatch(/Max-Age=600/);
      expect(oauth).not.toContain(state);
    }
  });

  it('signs up a new Kakao user end to end and logs out', async () => {
    const agent = await start();

    // 1. 콜백 → 가입 대기
    const callback = await loginWithKakao(agent);
    expect(callback.headers.location).toBe(`${TEST_ORIGIN}/signup/nickname`);
    expect(kakao.codes).toEqual(['kakao-code']);
    const signupCookie = cookies(callback).yj_signup;
    expect(signupCookie).toMatch(/HttpOnly/);
    expect(signupCookie).toMatch(/Path=\/api;/);
    expect(signupCookie).toMatch(/SameSite=Lax/);
    expect(cookies(callback).yj_oauth).toMatch(/Expires=Thu, 01 Jan 1970/);
    expect(db.user.rows).toHaveLength(0);

    await agent.get('/api/auth/session').expect(200, {
      status: 'SIGNUP_REQUIRED',
      signupDraft: {
        kakaoNickname: kakao.profile.nickname,
        profileImageUrl: kakao.profile.profileImageUrl,
        returnTo: null,
      },
      // 기능 플래그(env FEATURE_ACCOUNT_LINK). 테스트 환경은 켜 둔다(test/env.ts)
      features: { accountLink: true, cardImport: false, fileImport: false },
    });
    const pending = await agent.get('/api/users/me').expect(403);
    expect(pending.body.code).toBe('SIGNUP_REQUIRED');

    // 2. 가입
    const created = await agent
      .post('/api/auth/signup')
      .set('Origin', TEST_ORIGIN)
      .set('User-Agent', 'yeojeong-e2e')
      .send({ nickname: '  준용 ', agreements: AGREEMENTS, method: 'ALL' })
      .expect(201);
    expect(created.body).toMatchObject({
      nickname: '준용',
      profileImageUrl: kakao.profile.profileImageUrl,
      hasProfileImage: true,
      paymentMethodCount: 0,
      hasExpiredConnection: false,
      walletEntryCount: 0,
    });
    const session = cookies(created).yj_session;
    expect(session).toMatch(/HttpOnly/);
    expect(session).toMatch(/SameSite=Lax/);
    expect(session).toMatch(/Path=\/;/);
    expect(session).toMatch(/Max-Age=2592000/);
    expect(session).not.toMatch(/Secure/); // 로컬(http)에서는 Secure를 붙이지 않는다
    expect(cookies(created).yj_signup).toMatch(/Expires=Thu, 01 Jan 1970/);

    // 동의 이력: 필수 3행, 서버가 채운 값
    const consents = db.userConsent.rows;
    expect(
      consents
        .map((c) => String(c.consentId))
        .sort((a, b) => a.localeCompare(b)),
    ).toEqual(['AGE14', 'PRIVACY', 'TOS']);
    for (const consent of consents) {
      expect(consent).toMatchObject({
        userId: created.body.id,
        version: '0.1-draft',
        agreed: true,
        screen: 'WF-04',
        method: 'ALL',
        ua: 'yeojeong-e2e',
        docHash: 'a'.repeat(64),
      });
      expect(consent.userRefHash).toMatch(/^[0-9a-f]{64}$/);
      expect(consent.userRefHash).not.toBe(created.body.id);
      // 접속 IP는 평문 없이 HMAC만 남긴다
      expect(consent.ip).toBeUndefined();
      expect(consent.ipHash).toMatch(/^[0-9a-f]{64}$/);
    }
    // 세션 토큰은 해시만 저장한다
    const token = cookieValue(session).split('=')[1];
    expect(db.session.rows[0].tokenHash).toMatch(/^[0-9a-f]{64}$/);
    expect(JSON.stringify(db.session.rows)).not.toContain(token);
    expect(db.signupTicket.rows).toHaveLength(0);

    // 3. 로그인 상태
    await agent
      .get('/api/users/me')
      .expect(200)
      .expect((res) => expect(res.body.id).toBe(created.body.id));
    const state = await agent.get('/api/auth/session').expect(200);
    expect(state.headers['cache-control']).toBe('no-store');
    expect(state.body).toMatchObject({
      status: 'AUTHENTICATED',
      user: { id: created.body.id },
      reconsentRequired: [],
    });

    // 4. 로그아웃 → 401
    const out = await agent
      .post('/api/auth/logout')
      .set('Origin', TEST_ORIGIN)
      .expect(204);
    expect(cookies(out).yj_session).toMatch(/Expires=Thu, 01 Jan 1970/);
    expect(db.session.rows[0].revokedAt).toBeInstanceOf(Date);
    const after = await request(app.getHttpServer())
      .get('/api/users/me')
      .set('Cookie', cookieValue(session))
      .expect(401);
    expect(after.body.code).toBe('UNAUTHENTICATED');
  });

  it('keeps returnTo for a new member through signup (초대 링크로 들어온 신규 회원, QA)', async () => {
    const agent = await start();
    const callback = await loginWithKakao(agent, '/join?code=K7M2QX');
    // 닉네임 화면으로 보내고 returnTo는 가입 대기 쿠키(서명)에 남긴다
    expect(callback.headers.location).toBe(`${TEST_ORIGIN}/signup/nickname`);
    expect(cookies(callback).yj_signup).not.toContain('K7M2QX');
    const session = await agent.get('/api/auth/session').expect(200);
    expect(session.body.signupDraft.returnTo).toBe('/join?code=K7M2QX');

    const created = await agent
      .post('/api/auth/signup')
      .set('Origin', TEST_ORIGIN)
      .send({ nickname: '민지', agreements: AGREEMENTS, method: 'ALL' })
      .expect(201);
    expect(created.body).toMatchObject({
      nickname: '민지',
      returnTo: '/join?code=K7M2QX',
    });

    // 가입 대기 중 다른 탭이 같은 카카오 계정으로 먼저 가입을 마쳤으면 200(그 계정으로 로그인)이고 returnTo는 그대로다
    kakao.profile = { ...kakao.profile, id: '4001234568' };
    const otherTab = request.agent(app.getHttpServer());
    await loginWithKakao(otherTab, '/join?code=ABCDEF');
    await db.user.create({
      data: { kakaoId: '4001234568', nickname: '다른 탭' },
    });
    const late = await otherTab
      .post('/api/auth/signup')
      .set('Origin', TEST_ORIGIN)
      .send({ nickname: '다른 탭', agreements: AGREEMENTS, method: 'ALL' })
      .expect(200);
    expect(late.body.returnTo).toBe('/join?code=ABCDEF');
  });

  it('drops an unsafe returnTo (open redirect) for new members', async () => {
    for (const unsafe of [
      'https://evil.example/join',
      '//evil.example/join',
      '/\\evil.example',
      '/api/users/me',
    ]) {
      db = createFakeAuthPrisma();
      const agent = await start();
      await loginWithKakao(agent, unsafe);
      const session = await agent.get('/api/auth/session').expect(200);
      expect(session.body.signupDraft.returnTo).toBeNull();
      const created = await agent
        .post('/api/auth/signup')
        .set('Origin', TEST_ORIGIN)
        .send({ nickname: '태현', agreements: AGREEMENTS, method: 'ALL' })
        .expect(201);
      expect(created.body.returnTo).toBeNull();
      await app.close();
    }
    db = createFakeAuthPrisma();
    await start();
  });

  it('logs an existing user in and returns to the requested screen', async () => {
    const agent = await start();
    await signup(agent);
    await agent.post('/api/auth/logout').set('Origin', TEST_ORIGIN).expect(204);

    kakao.profile = { ...kakao.profile, profileImageUrl: null };
    const res = await loginWithKakao(agent, '/trips/abc?tab=stats');
    expect(res.headers.location).toBe(`${TEST_ORIGIN}/trips/abc?tab=stats`);
    expect(cookies(res).yj_session).toMatch(/HttpOnly/);
    expect(db.user.rows).toHaveLength(1);
    await agent
      .get('/api/users/me')
      .expect(200)
      .expect((r) =>
        expect(r.body).toMatchObject({
          profileImageUrl: null,
          hasProfileImage: false,
        }),
      );
  });

  it.each([
    '//evil.example.com',
    'https://evil.example.com',
    '/api/auth/logout',
  ])('ignores an unsafe returnTo %s', async (returnTo) => {
    const agent = await start();
    await signup(agent);
    const res = await loginWithKakao(agent, returnTo);
    expect(res.headers.location).toBe(`${TEST_ORIGIN}/`);
  });

  describe('callback errors', () => {
    it('rejects a state that does not match the cookie with 400 and no session', async () => {
      const agent = await start();
      await agent.get('/api/auth/kakao/start').expect(302);
      const res = await agent
        .get('/api/auth/kakao/callback')
        .query({ code: 'kakao-code', state: 'forged' })
        .expect(400);
      expect(res.body.code).toBe('BAD_REQUEST');
      expect(cookies(res).yj_session).toBeUndefined();
      expect(kakao.codes).toEqual([]);

      await request(app.getHttpServer())
        .get('/api/auth/kakao/callback')
        .query({ code: 'kakao-code', state: 'anything' })
        .expect(400);
    });

    it('sends a cancelled login back to the login screen', async () => {
      const agent = await start();
      const started = await agent.get('/api/auth/kakao/start').expect(302);
      const state = new URL(started.headers.location).searchParams.get('state');
      const res = await agent
        .get('/api/auth/kakao/callback')
        .query({ error: 'access_denied', state })
        .expect(302);
      expect(res.headers.location).toBe(`${TEST_ORIGIN}/login?error=cancelled`);
    });

    it('sends a Kakao failure back to the login screen', async () => {
      kakao.error = new KakaoError('token', 400, 'KOE320');
      const agent = await start();
      const res = await loginWithKakao(agent);
      expect(res.headers.location).toBe(`${TEST_ORIGIN}/login?error=failed`);
      expect(db.signupTicket.rows).toHaveLength(0);
    });
  });

  describe('signup validation', () => {
    async function pendingAgent() {
      const agent = await start();
      await loginWithKakao(agent);
      return agent;
    }

    it('requires every mandatory consent at the current version (TERMS_REQUIRED)', async () => {
      const agent = await pendingAgent();
      const res = await agent
        .post('/api/auth/signup')
        .set('Origin', TEST_ORIGIN)
        .send({
          nickname: '준용',
          agreements: [
            AGREEMENTS[0],
            { ...AGREEMENTS[1], version: '2020-01-01' },
            { ...AGREEMENTS[2], agreed: false },
          ],
          method: 'INDIVIDUAL',
        })
        .expect(400);
      expect(res.body).toMatchObject({
        code: 'TERMS_REQUIRED',
        message: ERRORS.TERMS_REQUIRED.message,
        details: {
          missing: ['PRIVACY', 'AGE14'],
          required: [
            { id: 'PRIVACY', version: '0.1-draft' },
            { id: 'AGE14', version: '0.1-draft' },
          ],
        },
      });
      expect(db.user.rows).toHaveLength(0);
    });

    it('does not accept hidden or other-stage consents', async () => {
      const agent = await pendingAgent();
      const res = await agent
        .post('/api/auth/signup')
        .set('Origin', TEST_ORIGIN)
        .send({
          nickname: '준용',
          agreements: [
            ...AGREEMENTS,
            { consentId: 'MARKETING', version: '0.1-draft', agreed: true },
            { consentId: 'FIN_LINK', version: '0.1-draft', agreed: true },
          ],
          method: 'ALL',
        })
        .expect(400);
      expect(res.body.code).toBe('VALIDATION_FAILED');
      expect(
        res.body.details.fields.map((f: { path: string }) => f.path),
      ).toEqual(['agreements.3.consentId', 'agreements.4.consentId']);
    });

    it.each([
      ['', 'EMPTY'],
      ['가나다라마바사아자차카', 'TOO_LONG'],
      ['준\n용', 'INVALID_CHARACTER'],
    ])('rejects nickname %j', async (nickname, code) => {
      const agent = await pendingAgent();
      const res = await agent
        .post('/api/auth/signup')
        .set('Origin', TEST_ORIGIN)
        .send({ nickname, agreements: AGREEMENTS, method: 'ALL' })
        .expect(400);
      expect(res.body.details.fields).toEqual([
        expect.objectContaining({ path: 'nickname', code }),
      ]);
    });

    it('rejects signup without a pending signup and from another origin', async () => {
      const agent = await start();
      const res = await agent
        .post('/api/auth/signup')
        .set('Origin', TEST_ORIGIN)
        .send({ nickname: '준용', agreements: AGREEMENTS, method: 'ALL' })
        .expect(401);
      expect(res.body.code).toBe('UNAUTHENTICATED');

      await loginWithKakao(agent);
      const csrf = await agent
        .post('/api/auth/signup')
        .set('Origin', 'https://evil.example.com')
        .send({ nickname: '준용', agreements: AGREEMENTS, method: 'ALL' })
        .expect(403);
      expect(csrf.body.code).toBe('CSRF_REJECTED');
    });

    it('logs into the existing account when the same Kakao user signs up twice', async () => {
      const first = await start();
      await signup(first);
      await app.close();

      const second = await start();
      await loginWithKakao(second); // 기존 회원이라 바로 로그인된다
      expect(db.user.rows).toHaveLength(1);
    });
  });

  describe('reconsent after a formal version is published', () => {
    it('returns CONSENT_REQUIRED to draft signers until they agree again', async () => {
      const agent = await start();
      const created = await signup(agent);
      const sessionCookie = cookieValue(cookies(created).yj_session);
      await app.close();

      // 정식본 발행(마이그레이션으로 행 추가)
      await db.consentDocument.createMany({
        data: [
          {
            consentId: 'TOS',
            version: '2026-10-01',
            title: '서비스 이용약관',
            required: true,
            docPath: 'docs/legal/TOS.md',
            docHash: 'b'.repeat(64),
            effectiveAt: new Date('2026-10-01T00:00:00+09:00'),
            changeType: 'MAJOR',
            summary: '약관을 정식으로 시행해요',
            isDraft: false,
          },
        ],
      });
      await start();
      const server = app.getHttpServer();

      const blocked = await request(server)
        .get('/api/users/me')
        .set('Cookie', sessionCookie)
        .expect(403);
      expect(blocked.body).toEqual({
        code: 'CONSENT_REQUIRED',
        message: ERRORS.CONSENT_REQUIRED.message,
        details: {
          missing: ['TOS'],
          required: [{ id: 'TOS', version: '2026-10-01' }],
        },
        requestId: blocked.headers['x-request-id'],
      });
      const state = await request(server)
        .get('/api/auth/session')
        .set('Cookie', sessionCookie)
        .expect(200);
      expect(state.body.reconsentRequired).toEqual([
        { id: 'TOS', version: '2026-10-01' },
      ]);
      // 요청 코드 발급 API는 없앴다(L-1). 재동의 전 탈퇴는 test/consent-v1.e2e-spec.ts(실DB)
      await request(server)
        .post('/api/users/me/deletion-request')
        .set('Cookie', sessionCookie)
        .set('Origin', TEST_ORIGIN)
        .expect(404);

      await request(server)
        .post('/api/auth/reconsent')
        .set('Cookie', sessionCookie)
        .set('Origin', TEST_ORIGIN)
        .send({
          agreements: [
            { consentId: 'TOS', version: '2026-10-01', agreed: true },
          ],
          method: 'INDIVIDUAL',
        })
        .expect(204);
      expect(
        db.userConsent.rows.find((c) => c.version === '2026-10-01'),
      ).toMatchObject({ screen: 'RECONSENT', docHash: 'b'.repeat(64) });
      await request(server)
        .get('/api/users/me')
        .set('Cookie', sessionCookie)
        .expect(200);
    });
  });

  describe('session lifetime', () => {
    it('extends a session that expires within 7 days', async () => {
      const agent = await start();
      await signup(agent);
      const row = db.session.rows[0];
      row.expiresAt = new Date(Date.now() + 86_400_000);
      const res = await agent.get('/api/users/me').expect(200);
      expect(cookies(res).yj_session).toMatch(/Max-Age=2592000/);
      expect((row.expiresAt as Date).getTime()).toBeGreaterThan(
        Date.now() + 29 * 86_400_000,
      );
    });

    it('clears an expired session cookie and answers 401', async () => {
      const agent = await start();
      await signup(agent);
      db.session.rows[0].expiresAt = new Date(Date.now() - 1000);
      const res = await agent.get('/api/users/me').expect(401);
      expect(cookies(res).yj_session).toMatch(/Expires=Thu, 01 Jan 1970/);
    });
  });

  it('serves the current consent documents publicly', async () => {
    const agent = await start();
    const res = await agent
      .get('/api/consents/documents?stage=SIGNUP')
      .expect(200);
    expect(res.body.map((d: { consentId: string }) => d.consentId)).toEqual([
      'TOS',
      'PRIVACY',
      'AGE14',
      'MARKETING',
    ]);
    expect(res.body[2]).toMatchObject({
      consentId: 'AGE14',
      hasDetail: false,
      docUrl: null,
      isDraft: true,
    });
    expect(res.body[3]).toMatchObject({ consentId: 'MARKETING', hidden: true });
    await agent.get('/api/consents/documents?stage=NOPE').expect(400);
  });

  it('stores financial link consents and reports their status (FR-809)', async () => {
    const agent = await start();
    await signup(agent);
    await agent.get('/api/consents/status?stage=FIN_LINK').expect(200, {
      valid: false,
      missing: ['FIN_LINK', 'FIN_PRIVACY', 'THIRD_PARTY'],
      required: [
        { id: 'FIN_LINK', version: '0.1-draft' },
        { id: 'FIN_PRIVACY', version: '0.1-draft' },
        { id: 'THIRD_PARTY', version: '0.1-draft' },
      ],
    });
    const body = {
      stage: 'FIN_LINK',
      method: 'ALL',
      screen: 'WF-28',
      agreements: ['FIN_LINK', 'FIN_PRIVACY', 'THIRD_PARTY'].map((id) => ({
        consentId: id,
        version: '0.1-draft',
        agreed: true,
      })),
    };
    await agent
      .post('/api/consents')
      .set('Origin', TEST_ORIGIN)
      .send({ ...body, agreements: body.agreements.slice(0, 2) })
      .expect(400)
      .expect((r) => expect(r.body.details.missing).toEqual(['THIRD_PARTY']));
    await agent
      .post('/api/consents')
      .set('Origin', TEST_ORIGIN)
      .send(body)
      .expect(201, { valid: true, missing: [], required: [] });
    await agent
      .get('/api/consents/status?stage=FIN_LINK')
      .expect(200)
      .expect((r) => expect(r.body.valid).toBe(true));
  });
});

describe('Auth cookies in production (e2e)', () => {
  let app: NestExpressApplication;

  afterEach(async () => {
    await app.close();
    vi.unstubAllEnvs();
  });

  it('marks cookies Secure when the web is served over https', async () => {
    vi.stubEnv('WEB_BASE_URL', 'https://jinyeojeong.com');
    app = await createTestApp([], {
      auth: 'real',
      prisma: createFakeAuthPrisma(),
      overrides: [[KakaoClient, new FakeKakao()]],
    });
    const res = await request(app.getHttpServer())
      .get('/api/auth/kakao/start')
      .expect(302);
    expect(cookies(res).yj_oauth).toMatch(/; Secure/);
  });
});
