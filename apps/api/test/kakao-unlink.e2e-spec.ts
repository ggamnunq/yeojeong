import type { NestExpressApplication } from '@nestjs/platform-express';
import request from 'supertest';
import type { PrismaService } from './../src/prisma/prisma.service.js';
import {
  createDbTestApp,
  createSession,
  createUser,
  describeWithDb,
} from './account-fixtures.js';

// 카카오 "연결 끊기 알림"(기능명세 7-1, 미결 Q-32 기본안 = 세션 전체 폐기 + 운영 알림). 실제 DB(DATABASE_URL).
const ADMIN_KEY = 'test-kakao-admin-key-0123456789abcdef';
const APP_ID = '1234567';
const PATH = '/api/auth/kakao/unlink';
const ORIGIN_SECRET = 'test-origin-secret-0123456789abcdefghij';

describeWithDb(
  '카카오 연결 끊기 알림 /api/auth/kakao/unlink (e2e, 실제 DB)',
  () => {
    let app: NestExpressApplication;
    let db: PrismaService;
    const userIds: string[] = [];

    beforeAll(async () => {
      vi.stubEnv('KAKAO_ADMIN_KEY', ADMIN_KEY);
      vi.stubEnv('KAKAO_APP_ID', APP_ID);
      ({ app, db } = await createDbTestApp());
    });

    afterAll(async () => {
      await db.accessLog.deleteMany({ where: { userId: { in: userIds } } });
      await db.session.deleteMany({ where: { userId: { in: userIds } } });
      await db.user.deleteMany({ where: { id: { in: userIds } } });
      await app.close();
      vi.unstubAllEnvs();
    });

    async function member() {
      const user = await createUser(db, { nickname: '준용' });
      userIds.push(user.id);
      await createSession(db, user.id);
      await createSession(db, user.id);
      return user;
    }

    const form = (kakaoId: string, appId = APP_ID) =>
      `app_id=${appId}&user_id=${kakaoId}&referrer_type=UNLINK_FROM_APPS`;

    it('is a 404 while KAKAO_ADMIN_KEY is not configured', async () => {
      vi.stubEnv('KAKAO_ADMIN_KEY', '');
      const { app: disabled } = await createDbTestApp();
      try {
        await request(disabled.getHttpServer())
          .get(`${PATH}?app_id=${APP_ID}&user_id=1`)
          .set('Authorization', `KakaoAK ${ADMIN_KEY}`)
          .expect(404);
        await request(disabled.getHttpServer())
          .post(PATH)
          .type('form')
          .send(form('1'))
          .expect(404);
      } finally {
        await disabled.close();
        vi.stubEnv('KAKAO_ADMIN_KEY', ADMIN_KEY);
      }
    });

    it('rejects a missing or wrong admin key and a wrong app_id with a bare 401', async () => {
      const user = await member();
      const send = (auth: string | null, appId = APP_ID) => {
        const req = request(app.getHttpServer()).post(PATH).type('form');
        if (auth !== null) req.set('Authorization', auth);
        return req.send(form(user.kakaoId, appId));
      };
      for (const res of [
        await send(null),
        await send(`KakaoAK ${ADMIN_KEY}x`),
        await send(`Bearer ${ADMIN_KEY}`),
        await send(`KakaoAK ${ADMIN_KEY}`, '7654321'),
      ]) {
        expect(res.status).toBe(401);
        expect(res.body.code).toBe('UNAUTHENTICATED');
        expect(JSON.stringify(res.body)).not.toContain(ADMIN_KEY);
      }
      expect(
        await db.session.count({ where: { userId: user.id, revokedAt: null } }),
      ).toBe(2);
    });

    it('POST form without Origin (server-to-server, CSRF exempt) revokes every session and deletes pending signups; repeated calls are idempotent', async () => {
      const user = await member();
      await db.signupTicket.create({
        data: {
          kakaoId: user.kakaoId,
          kakaoNickname: '카카오 닉네임',
          expiresAt: new Date(Date.now() + 60_000),
        },
      });
      const call = () =>
        request(app.getHttpServer())
          .post(PATH)
          .type('form')
          .set('Authorization', `KakaoAK ${ADMIN_KEY}`)
          .send(form(user.kakaoId));

      const res = await call().expect(200);
      expect(res.text).toBe('');
      expect(
        await db.session.count({ where: { userId: user.id, revokedAt: null } }),
      ).toBe(0);
      expect(
        await db.signupTicket.count({ where: { kakaoId: user.kakaoId } }),
      ).toBe(0);
      // 미결 Q-32 기본안: 탈퇴하지 않는다(회원·데이터 유지)
      expect(await db.user.count({ where: { id: user.id } })).toBe(1);
      const logs = await db.accessLog.findMany({
        where: { userId: user.id, action: 'KAKAO_UNLINKED' },
      });
      expect(logs).toHaveLength(1);
      expect(logs[0]).toMatchObject({
        resourceType: 'USER',
        resourceId: user.id,
        details: { revokedSessions: 2 },
      });
      expect(JSON.stringify(logs[0])).not.toContain(user.kakaoId);

      await call().expect(200);
      expect(
        await db.session.count({ where: { userId: user.id, revokedAt: null } }),
      ).toBe(0);
    });

    it('GET with query parameters works too, and unknown members get the same 200', async () => {
      const user = await member();
      await request(app.getHttpServer())
        .get(PATH)
        .query({
          app_id: APP_ID,
          user_id: user.kakaoId,
          referrer_type: 'ACCOUNT_DELETE',
        })
        .set('Authorization', `KakaoAK ${ADMIN_KEY}`)
        .expect(200);
      expect(
        await db.session.count({ where: { userId: user.id, revokedAt: null } }),
      ).toBe(0);
      await request(app.getHttpServer())
        .get(PATH)
        .query({ app_id: APP_ID, user_id: '999999999999' })
        .set('Authorization', `KakaoAK ${ADMIN_KEY}`)
        .expect(200);
    });

    it('stays behind the origin lock: only requests relayed by the Worker (x-origin-auth) reach it', async () => {
      vi.stubEnv('ORIGIN_SECRET', ORIGIN_SECRET);
      const { app: locked } = await createDbTestApp();
      try {
        const user = await member();
        await request(locked.getHttpServer())
          .post(PATH)
          .type('form')
          .set('Authorization', `KakaoAK ${ADMIN_KEY}`)
          .send(form(user.kakaoId))
          .expect(403);
        await request(locked.getHttpServer())
          .post(PATH)
          .type('form')
          .set('Authorization', `KakaoAK ${ADMIN_KEY}`)
          .set('X-Origin-Auth', ORIGIN_SECRET)
          .send(form(user.kakaoId))
          .expect(200);
      } finally {
        await locked.close();
        vi.stubEnv('ORIGIN_SECRET', '');
      }
    });
  },
);
