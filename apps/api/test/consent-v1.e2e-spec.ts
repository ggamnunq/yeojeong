import type { NestExpressApplication } from '@nestjs/platform-express';
import { ERRORS } from '@yeojeong/shared';
import request from 'supertest';
import {
  CONSENT_DOCUMENT_VERSIONS,
  V1_EFFECTIVE_AT,
} from './../src/common/auth/index.js';
import type { PrismaService } from './../src/prisma/prisma.service.js';
import {
  createDbTestApp,
  createSession,
  createUser,
  describeWithDb,
  removeUsers,
} from './account-fixtures.js';
import { TEST_ORIGIN } from './auth-helpers.js';

// 정식 약관 v1.0(L-1): 마이그레이션 20261030010000이 넣은 행과, 시행일부터 초안 동의자가 재동의를 타는지(실DB·실제 가드).
// 시행일(2026-10-30 00:00 KST) 전후를 Date만 바꿔 본다(타이머·DB 시각은 그대로).
describeWithDb('Formal terms v1.0 → reconsent (e2e, real DB)', () => {
  let app: NestExpressApplication;
  let db: PrismaService;
  const users: string[] = [];
  const v1 = CONSENT_DOCUMENT_VERSIONS.filter((d) => d.version === '1.0');

  const at = (iso: string) =>
    vi.useFakeTimers({ toFake: ['Date'], now: new Date(iso) });

  async function draftSigner() {
    const user = await createUser(db, { nickname: '초안동의' });
    users.push(user.id);
    for (const consentId of ['TOS', 'PRIVACY', 'AGE14'] as const) {
      const draft = CONSENT_DOCUMENT_VERSIONS.find(
        (d) => d.consentId === consentId && d.isDraft,
      )!;
      await db.userConsent.create({
        data: {
          userId: user.id,
          userRefHash: 'e'.repeat(64),
          consentId,
          version: draft.version,
          agreed: true,
          ua: 'yeojeong-l1-e2e',
          screen: 'WF-04',
          method: 'ALL',
          docHash: draft.docHash,
        },
      });
    }
    const { token } = await createSession(db, user.id);
    return { user, cookie: `yj_session=${token}` };
  }

  beforeAll(async () => {
    ({ app, db } = await createDbTestApp());
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  afterAll(async () => {
    await removeUsers(db, users);
    await db.userConsent.deleteMany({ where: { ua: 'yeojeong-l1-e2e' } });
    await app.close();
  });

  it('the migration published TOS·PRIVACY·AGE14 1.0 (formal, MAJOR, effective 2026-10-30 KST, file hashes)', async () => {
    const rows = await db.consentDocument.findMany({
      where: { version: '1.0' },
      orderBy: { consentId: 'asc' },
    });
    expect(rows.map((r) => r.consentId).sort()).toEqual(
      ['AGE14', 'PRIVACY', 'TOS'].sort(),
    );
    for (const row of rows) {
      const expected = v1.find((d) => d.consentId === row.consentId)!;
      expect(row).toMatchObject({
        isDraft: false,
        changeType: 'MAJOR',
        required: true,
        docPath: expected.docPath,
        docHash: expected.docHash,
        summary: expected.summary,
      });
      expect(row.effectiveAt.toISOString()).toBe(V1_EFFECTIVE_AT.toISOString());
    }
    // v1.0에 없는 동의는 초안만 있다
    expect(
      await db.consentDocument.count({
        where: {
          consentId: {
            in: [
              'MARKETING',
              'FIN_LINK',
              'FIN_PRIVACY',
              'THIRD_PARTY',
              'CARD_IMPORT',
            ],
          },
          isDraft: false,
        },
      }),
    ).toBe(0);
  });

  it('keeps draft signers in until the effective date', async () => {
    const { cookie } = await draftSigner();
    at('2026-10-29T23:59:00+09:00');
    const res = await request(app.getHttpServer())
      .get('/api/users/me')
      .set('Cookie', cookie)
      .expect(200);
    expect(res.body.nickname).toBe('초안동의');
    const docs = await request(app.getHttpServer())
      .get('/api/consents/documents?stage=SIGNUP')
      .expect(200);
    expect(
      (docs.body as { consentId: string; version: string }[])
        .filter((d) => d.consentId !== 'MARKETING')
        .map((d) => d.version),
    ).toEqual(['0.1-draft', '0.1-draft', '0.1-draft']);
  });

  it('asks draft signers to agree to 1.0 from the effective date, then lets them in', async () => {
    const { user, cookie } = await draftSigner();
    at('2026-10-30T00:00:30+09:00');
    // 캐시(1분)가 시행일 전 목록을 들고 있지 않게 새 앱으로 본다
    await app.close();
    ({ app, db } = await createDbTestApp());
    const server = app.getHttpServer();
    const required = [
      { id: 'TOS', version: '1.0' },
      { id: 'PRIVACY', version: '1.0' },
      { id: 'AGE14', version: '1.0' },
    ];

    const blocked = await request(server)
      .get('/api/users/me')
      .set('Cookie', cookie)
      .expect(403);
    expect(blocked.body).toMatchObject({
      code: 'CONSENT_REQUIRED',
      message: ERRORS.CONSENT_REQUIRED.message,
      details: { missing: ['TOS', 'PRIVACY', 'AGE14'], required },
    });
    const state = await request(server)
      .get('/api/auth/session')
      .set('Cookie', cookie)
      .expect(200);
    expect(state.body.reconsentRequired).toEqual(required);

    const docs = await request(server)
      .get('/api/consents/documents?stage=SIGNUP')
      .expect(200);
    expect(
      (docs.body as { consentId: string; version: string; isDraft: boolean }[])
        .filter((d) => d.consentId !== 'MARKETING')
        .map((d) => [d.consentId, d.version, d.isDraft]),
    ).toEqual([
      ['TOS', '1.0', false],
      ['PRIVACY', '1.0', false],
      ['AGE14', '1.0', false],
    ]);

    // 초안 버전으로 재동의하면 거절
    await request(server)
      .post('/api/auth/reconsent')
      .set('Cookie', cookie)
      .set('Origin', TEST_ORIGIN)
      .send({
        agreements: required.map((r) => ({
          consentId: r.id,
          version: '0.1-draft',
          agreed: true,
        })),
        method: 'ALL',
      })
      .expect(400);

    await request(server)
      .post('/api/auth/reconsent')
      .set('Cookie', cookie)
      .set('Origin', TEST_ORIGIN)
      .send({
        agreements: required.map((r) => ({
          consentId: r.id,
          version: r.version,
          agreed: true,
        })),
        method: 'ALL',
      })
      .expect(204);

    const rows = await db.userConsent.findMany({
      where: { userId: user.id, version: '1.0' },
    });
    expect(rows).toHaveLength(3);
    for (const row of rows) {
      expect(row).toMatchObject({
        screen: 'RECONSENT',
        agreed: true,
        docHash: v1.find((d) => d.consentId === row.consentId)!.docHash,
      });
    }
    // 초안 동의 행은 고치지 않고 남는다(append-only)
    expect(
      await db.userConsent.count({
        where: { userId: user.id, version: '0.1-draft', withdrawnAt: null },
      }),
    ).toBe(3);

    await request(server)
      .get('/api/users/me')
      .set('Cookie', cookie)
      .expect(200);
  });

  it('lets a user who has not re-agreed withdraw: DELETE /users/me passes the ConsentGuard (terms art. 3 ⑤)', async () => {
    const { user, cookie } = await draftSigner();
    at('2026-10-30T09:00:00+09:00');
    await app.close();
    ({ app, db } = await createDbTestApp());
    const server = app.getHttpServer();

    // 다른 화면은 막힌다
    await request(server)
      .get('/api/users/me')
      .set('Cookie', cookie)
      .expect(403);
    // 재동의 화면에서 연 탈퇴 화면(WF-59)은 고정 사실 3줄만 그린다 — 내 여정 목록은 여전히 막히고, 공지는 공개
    await request(server)
      .get('/api/me/trips')
      .set('Cookie', cookie)
      .expect(403);
    await request(server).get('/api/notices/active').expect(200);

    // 확인 없이는 400, 확인하면 204 + 세션 쿠키 삭제 + 회원 삭제
    await request(server)
      .delete('/api/users/me')
      .set('Cookie', cookie)
      .set('Origin', TEST_ORIGIN)
      .send({})
      .expect(400);
    const res = await request(server)
      .delete('/api/users/me')
      .set('Cookie', cookie)
      .set('Origin', TEST_ORIGIN)
      .send({ confirm: true })
      .expect(204);
    expect(String(res.headers['set-cookie'])).toMatch(/yj_session=;/);
    expect(await db.user.findUnique({ where: { id: user.id } })).toBeNull();
    expect(
      await db.accountDeletion.findFirst({
        where: {
          userRefHash: { not: '' },
          channel: 'IN_APP',
          completedAt: { not: null },
        },
        orderBy: { requestedAt: 'desc' },
      }),
    ).not.toBeNull();
    // 초안 동의 행은 탈퇴로 철회 처리된다(user_id NULL, ACCOUNT_DELETED)
    expect(
      await db.userConsent.count({
        where: {
          ua: 'yeojeong-l1-e2e',
          userId: null,
          withdrawChannel: 'ACCOUNT_DELETED',
        },
      }),
    ).toBeGreaterThanOrEqual(3);
  });

  it('serves active notices publicly with a short cache (Q-57)', async () => {
    at('2026-10-30T09:00:00+09:00');
    const res = await request(app.getHttpServer())
      .get('/api/notices/active')
      .expect(200);
    expect(res.headers['cache-control']).toBe('private, max-age=300');
    expect(res.body).toEqual({
      items: [
        {
          id: 'legal-v1.0-published',
          title: '서비스 이용약관과 개인정보처리방침을 게시했어요',
          url: '/terms',
          startsAt: '2026-10-29T15:00:00.000Z',
          endsAt: '2026-11-28T15:00:00.000Z',
        },
      ],
    });
    at('2026-11-29T00:00:00+09:00');
    expect(
      (
        await request(app.getHttpServer())
          .get('/api/notices/active')
          .expect(200)
      ).body,
    ).toEqual({ items: [] });
  });
});
