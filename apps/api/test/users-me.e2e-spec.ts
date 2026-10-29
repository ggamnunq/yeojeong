import type { NestExpressApplication } from '@nestjs/platform-express';
import request from 'supertest';
import { SESSION_COOKIE } from './../src/common/auth/index.js';
import type { PrismaService } from './../src/prisma/prisma.service.js';
import {
  createDbTestApp,
  createGroupWithTrip,
  createSession,
  createSignupConsents,
  createUser,
  describeWithDb,
  removeGroups,
} from './account-fixtures.js';
import { TEST_ORIGIN } from './auth-helpers.js';

const cookie = (token: string) => `${SESSION_COOKIE}=${token}`;

interface MemberView {
  membershipId: string;
  nickname: string;
  isMe: boolean;
}

describeWithDb('PATCH /api/users/me 닉네임 변경 FR-902 (e2e, 실제 DB)', () => {
  let app: NestExpressApplication;
  let db: PrismaService;
  const groupIds: string[] = [];
  const userIds: string[] = [];

  beforeAll(async () => {
    ({ app, db } = await createDbTestApp());
  });

  afterAll(async () => {
    await removeGroups(db, groupIds);
    // 세션·동의는 users에 Cascade
    await db.user.deleteMany({ where: { id: { in: userIds } } });
    await app.close();
  });

  /** 진행 중 여정: 준용(그룹장)·민지 */
  async function seed() {
    const junyong = await createUser(db, { nickname: '준용' });
    const minji = await createUser(db, { nickname: '민지' });
    userIds.push(junyong.id, minji.id);
    await createSignupConsents(db, junyong.id);
    await createSignupConsents(db, minji.id);
    const trip = await createGroupWithTrip(db, {
      status: 'ONGOING',
      members: [{ userId: junyong.id }, { userId: minji.id }],
    });
    groupIds.push(trip.group.id);
    const s1 = await createSession(db, junyong.id);
    const s2 = await createSession(db, minji.id);
    return {
      junyong,
      minji,
      tripId: trip.trip.id,
      junyongMembershipId: trip.memberships[0].id,
      tokens: { junyong: s1.token, minji: s2.token },
    };
  }

  const patch = (token: string | null, body: unknown, origin = true) => {
    let req = request(app.getHttpServer()).patch('/api/users/me');
    if (origin) req = req.set('Origin', TEST_ORIGIN);
    if (token) req = req.set('Cookie', cookie(token));
    return req.send(body as object);
  };

  it('requires a session and an allowed Origin', async () => {
    const s = await seed();
    await patch(null, { nickname: '준용이' }).expect(401);
    const csrf = await patch(s.tokens.junyong, { nickname: '준용이' }, false);
    expect(csrf.status).toBe(403);
    expect(csrf.body.code).toBe('CSRF_REJECTED');
    const user = await db.user.findUnique({ where: { id: s.junyong.id } });
    expect(user?.nickname).toBe('준용');
  });

  it.each([
    ['empty', '   ', 'EMPTY'],
    ['too long', '가나다라마바사아자차카', 'TOO_LONG'],
    ['line break', '준\n용', 'INVALID_CHARACTER'],
  ])(
    'rejects a %s nickname with the signup rules',
    async (_, nickname, code) => {
      const s = await seed();
      const res = await patch(s.tokens.junyong, { nickname }).expect(400);
      expect(res.body.code).toBe('VALIDATION_FAILED');
      expect(res.body.details.fields[0]).toMatchObject({
        path: 'nickname',
        code,
      });
      const user = await db.user.findUnique({ where: { id: s.junyong.id } });
      expect(user?.nickname).toBe('준용');
    },
  );

  it('rejects a missing or non-string nickname', async () => {
    const s = await seed();
    const missing = await patch(s.tokens.junyong, {}).expect(400);
    expect(missing.body.code).toBe('VALIDATION_FAILED');
    await patch(s.tokens.junyong, { nickname: 7 }).expect(400);
  });

  it('saves the trimmed nickname, returns Me and shows it to other members right away', async () => {
    const s = await seed();
    const server = app.getHttpServer();

    const res = await patch(s.tokens.junyong, {
      nickname: ' 준용이🧳 ',
    }).expect(200);
    expect(res.body).toMatchObject({ id: s.junyong.id, nickname: '준용이🧳' });

    const me = await request(server)
      .get('/api/users/me')
      .set('Cookie', cookie(s.tokens.junyong))
      .expect(200);
    expect(me.body.nickname).toBe('준용이🧳');

    const session = await request(server)
      .get('/api/auth/session')
      .set('Cookie', cookie(s.tokens.junyong))
      .expect(200);
    expect(session.body.user.nickname).toBe('준용이🧳');

    // 민지 화면의 그룹원: users 조인이라 다음 조회부터 바뀐 이름
    const detail = await request(server)
      .get(`/api/trips/${s.tripId}`)
      .set('Cookie', cookie(s.tokens.minji))
      .expect(200);
    const members = detail.body.members as MemberView[];
    const junyong = members.find(
      (m) => m.membershipId === s.junyongMembershipId,
    );
    const minji = members.find((m) => m.isMe);
    expect(junyong?.nickname).toBe('준용이🧳');
    // 다른 사용자는 그대로
    expect(minji?.nickname).toBe('민지');
    const minjiRow = await db.user.findUnique({ where: { id: s.minji.id } });
    expect(minjiRow?.nickname).toBe('민지');
  });

  it('allows a nickname another member already uses', async () => {
    const s = await seed();
    const res = await patch(s.tokens.junyong, { nickname: '민지' }).expect(200);
    expect(res.body.nickname).toBe('민지');
  });
});
