import type { NestExpressApplication } from '@nestjs/platform-express';
import { ERRORS } from '@yeojeong/shared';
import request from 'supertest';
import {
  CONSENT_DOCUMENT_VERSIONS,
  currentConsentVersion,
  V1_EFFECTIVE_AT,
} from './../src/common/auth/index.js';
import { activeNotices } from './../src/notices/notices.js';
import type { PrismaService } from './../src/prisma/prisma.service.js';
import {
  createDbTestApp,
  createSession,
  createUser,
  describeWithDb,
  removeUsers,
} from './account-fixtures.js';
import { TEST_ORIGIN } from './auth-helpers.js';

// 정식 약관(L-1, 게시 당시 표기 1.0 = 지금 0.1): 마이그레이션 20261030010000이 넣은 행과, 시행일부터 초안 동의자가 재동의를 타는지(실DB·실제 가드).
// 시행일(2026-10-30 00:00 KST) 전후를 Date만 바꿔 본다(타이머·DB 시각은 그대로). 지금 받는 버전(0.1, 같은 날 게시한 다음 판이 있으면 그 판)은
// 카탈로그(currentConsentVersion)로 정한다 — 다음 판 게시일은 docs/legal/releases.json.
describeWithDb('Formal terms 1.0 (= 0.1) → reconsent (e2e, real DB)', () => {
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
    // 정식본을 낸 적 없는 동의는 초안만 있다(카드 불러오기는 0.x에서 정식본을 낸다)
    expect(
      await db.consentDocument.count({
        where: {
          consentId: {
            in: ['MARKETING', 'FIN_LINK', 'FIN_PRIVACY', 'THIRD_PARTY'],
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

  it('asks draft signers to agree to the formal version from the effective date, then lets them in', async () => {
    const { user, cookie } = await draftSigner();
    at('2026-10-30T00:00:30+09:00');
    // 캐시(1분)가 시행일 전 목록을 들고 있지 않게 새 앱으로 본다
    await app.close();
    ({ app, db } = await createDbTestApp());
    const server = app.getHttpServer();
    const now = new Date();
    const current = (id: 'TOS' | 'PRIVACY' | 'AGE14') =>
      currentConsentVersion(id, CONSENT_DOCUMENT_VERSIONS, now);
    const required = (['TOS', 'PRIVACY', 'AGE14'] as const).map((id) => ({
      id,
      version: current(id).version,
    }));
    // 게시 당시 표기 1.0은 더 이상 받지 않는다(0.1이 대신한다)
    expect(required.map((r) => r.version)).not.toContain('1.0');

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
    ).toEqual(required.map((r) => [r.id, r.version, false]));

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
      where: { userId: user.id, screen: 'RECONSENT' },
    });
    expect(rows).toHaveLength(3);
    for (const row of rows) {
      const doc = current(row.consentId as 'TOS' | 'PRIVACY' | 'AGE14');
      expect(row).toMatchObject({
        version: doc.version,
        agreed: true,
        docHash: doc.docHash,
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
    // 목록은 정적 정의(src/notices/notices.ts, 0.2 공지 날짜는 legal-manifest)와 같다 — 최신부터, UTC ISO
    expect(res.body).toEqual({ items: activeNotices(new Date()) });
    expect(
      (res.body as { items: { id: string }[] }).items.length,
    ).toBeGreaterThan(0);
    at('2027-06-01T00:00:00+09:00');
    expect(
      (
        await request(app.getHttpServer())
          .get('/api/notices/active')
          .expect(200)
      ).body,
    ).toEqual({ items: [] });
  });

  it('keeps raw client IPs only on admin access log rows (CHECK access_logs_client_ip_admin_only_check)', async () => {
    const userId = '00000000-0000-4000-8000-0000000000aa';
    await expect(
      db.accessLog.create({
        data: {
          userId,
          action: 'LIST_EXPENSES',
          resourceType: 'TRIP',
          clientIp: '203.0.113.9',
        },
      }),
    ).rejects.toThrow();
    const admin = await db.accessLog.create({
      data: {
        userId,
        action: 'ADMIN_LOGIN',
        resourceType: 'ADMIN',
        clientIp: '203.0.113.9',
      },
      select: { id: true, clientIp: true },
    });
    expect(admin.clientIp).toBe('203.0.113.9');
    await db.accessLog.delete({ where: { id: admin.id } });
  });
});
