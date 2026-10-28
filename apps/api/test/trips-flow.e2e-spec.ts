import type { NestExpressApplication } from '@nestjs/platform-express';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { formatInviteCode, type TripDetailResponse } from '@yeojeong/shared';
import request from 'supertest';
import type { AuthUser } from './../src/common/auth/auth-context.js';
import { InviteCodeGenerator } from './../src/trips/invite-code.generator.js';
import { addDays, kstDate } from './../src/trips/kst.js';
import {
  JOB_SECRET,
  TEST_DATABASE_URL,
  createRealDbApp,
  type RealDbContext,
} from './trips-db-helpers.js';

// 실제 DB로 트랜잭션·잠금·제약을 확인한다. TEST_DATABASE_URL이 없으면(CI) 건너뛴다(trips-db-helpers.ts 참고).
describe.skipIf(!TEST_DATABASE_URL)('S2A trips·groups (e2e, real DB)', () => {
  let ctx: RealDbContext;
  let app: NestExpressApplication;

  beforeEach(async () => {
    ctx = await createRealDbApp();
    app = ctx.app;
  });

  afterEach(async () => {
    await app.close();
  });

  const server = () => app.getHttpServer();
  const today = kstDate(new Date());

  async function createTrip(leader: AuthUser, overrides: object = {}) {
    const res = await request(server())
      .post('/api/trips')
      .set(ctx.auth.headers(leader))
      .send({
        groupName: '오사카 3박 4일',
        place: { countryCode: 'JP', city: '오사카', label: '일본 오사카' },
        startDate: today,
        endDate: addDays(today, 3),
        budgetKrw: 1_200_000,
        ...overrides,
      })
      .expect(201);
    return res.body as { tripId: string; groupId: string; inviteCode: string };
  }

  async function detail(user: AuthUser, tripId: string) {
    const res = await request(server())
      .get(`/api/trips/${tripId}`)
      .set(ctx.auth.headers(user))
      .expect(200);
    return res.body as TripDetailResponse;
  }

  function join(user: AuthUser, code: string) {
    return request(server())
      .post(`/api/invites/${code}/join`)
      .set(ctx.auth.headers(user));
  }

  it('runs create → list → detail → join → kick → leave·succession → start → end → lock', async () => {
    const junyong = await ctx.addUser('준용');
    const minji = await ctx.addUser('민지');
    const taehyun = await ctx.addUser('태현');
    const subin = await ctx.addUser('수빈');

    // 만들기: 그룹장 joinOrder 1, 통화는 국가로
    const created = await createTrip(junyong);
    expect(created.inviteCode).toMatch(/^[2-9A-HJKMNP-Z]{6}$/);
    const trip = await ctx.prisma.trip.findUniqueOrThrow({
      where: { id: created.tripId },
    });
    expect(trip).toMatchObject({
      currency: 'JPY',
      status: 'UPCOMING',
      version: 0,
    });
    expect(trip.startAt.toISOString()).toBe(
      new Date(`${today}T00:00:00+09:00`).toISOString(),
    );

    // 목록·상세(시작 전 셸)
    const list = await request(server())
      .get('/api/me/trips')
      .set(ctx.auth.headers(junyong))
      .expect(200);
    expect(list.body).toEqual({
      lastViewedTripId: null,
      items: [
        expect.objectContaining({
          tripId: created.tripId,
          status: 'UPCOMING',
          memberCount: 1,
          isLeader: true,
        }),
      ],
    });
    let mine = await detail(junyong, created.tripId);
    expect(mine).toMatchObject({
      groupName: '오사카 3박 4일',
      currency: 'JPY',
      nights: 3,
      days: 4,
      dDay: 0,
      inviteCode: created.inviteCode,
      fx: { policy: 'SPOT_AT_PAYMENT', tripCurrency: 'JPY' },
      me: { role: 'LEADER', pendingCount: 0, connectionExpired: false },
      shell: {
        defaultTab: 'INFO',
        secondTab: 'SUMMARY',
        lockedTabs: ['EXPENSES', 'SUMMARY'],
      },
      permissions: {
        canEdit: true,
        canStart: true,
        canEnd: false,
        canDeleteGroup: true,
        canKick: true,
        canInvite: true,
      },
      unseenEvents: [],
    });
    expect(mine.members).toHaveLength(1);
    const relisted = await request(server())
      .get('/api/me/trips')
      .set(ctx.auth.headers(junyong))
      .expect(200);
    expect(relisted.body.lastViewedTripId).toBe(created.tripId);

    // 미리보기(대소문자·하이픈 무시) → 참여
    const preview = await request(server())
      .get(`/api/invites/${formatInviteCode(created.inviteCode).toLowerCase()}`)
      .set(ctx.auth.headers(minji))
      .expect(200);
    expect(preview.body).toEqual({
      groupName: '오사카 3박 4일',
      placeLabel: '일본 오사카',
      startDate: today,
      endDate: addDays(today, 3),
      status: 'UPCOMING',
      memberCount: 1,
      membersPreview: [{ nickname: '준용', profileImageUrl: null }],
      alreadyMember: false,
      tripId: null,
    });
    await join(minji, created.inviteCode).expect(201).expect({
      tripId: created.tripId,
      groupId: created.groupId,
      status: 'UPCOMING',
    });
    await join(taehyun, created.inviteCode).expect(201);
    await join(subin, created.inviteCode).expect(201);
    await join(minji, created.inviteCode)
      .expect(409)
      .expect((r) => expect(r.body.code).toBe('ALREADY_MEMBER'));
    const again = await request(server())
      .get(`/api/invites/${created.inviteCode}`)
      .set(ctx.auth.headers(minji))
      .expect(200);
    expect(again.body).toMatchObject({
      alreadyMember: true,
      tripId: created.tripId,
      memberCount: 4,
    });

    const joined = ctx.events.filter((e) => e.name === 'membership.joined');
    expect(joined.map((e) => e.payload.userId)).toEqual([
      minji.id,
      taehyun.id,
      subin.id,
    ]);
    expect(joined[0].payload).toMatchObject({
      tripStatus: 'UPCOMING',
      rejoined: false,
    });

    // 그룹원 패널: 가입 순
    const members = await request(server())
      .get(`/api/groups/${created.groupId}/members`)
      .set(ctx.auth.headers(minji))
      .expect(200);
    expect(
      members.body.map((m: { nickname: string; joinOrder: number }) => [
        m.nickname,
        m.joinOrder,
      ]),
    ).toEqual([
      ['준용', 1],
      ['민지', 2],
      ['태현', 3],
      ['수빈', 4],
    ]);
    const subinMembership = members.body[3].membershipId as string;

    // 멤버는 수정·강퇴 불가
    const minjiView = await detail(minji, created.tripId);
    expect(minjiView.permissions).toMatchObject({
      canEdit: false,
      editableFields: [],
      canStart: false,
      canKick: false,
      canInvite: true,
    });
    await request(server())
      .patch(`/api/trips/${created.tripId}`)
      .set(ctx.auth.headers(minji))
      .send({ budgetKrw: 1, version: 0 })
      .expect(403)
      .expect((r) => expect(r.body.code).toBe('NOT_LEADER'));

    // 강퇴 → 강퇴자는 404, 다시 참여 불가
    await request(server())
      .delete(`/api/groups/${created.groupId}/members/${mine.me.membershipId}`)
      .set(ctx.auth.headers(junyong))
      .expect(400)
      .expect((r) => expect(r.body.code).toBe('CANNOT_KICK_SELF'));
    await request(server())
      .delete(`/api/groups/${created.groupId}/members/${subinMembership}`)
      .set(ctx.auth.headers(junyong))
      .expect(204);
    await request(server())
      .get(`/api/trips/${created.tripId}`)
      .set(ctx.auth.headers(subin))
      .expect(404);
    await request(server())
      .get(`/api/invites/${created.inviteCode}`)
      .set(ctx.auth.headers(subin))
      .expect(403)
      .expect((r) => expect(r.body.code).toBe('MEMBER_KICKED'));
    await join(subin, created.inviteCode).expect(403);
    expect(
      ctx.events.find((e) => e.name === 'membership.left')?.payload,
    ).toMatchObject({
      membershipId: subinMembership,
      userId: subin.id,
      reason: 'KICKED',
    });

    // 그룹장 나가기 → 가입 순 다음(민지) 승계, 남은 멤버는 1회성 토스트
    const leave = await request(server())
      .post(`/api/groups/${created.groupId}/leave`)
      .set(ctx.auth.headers(junyong))
      .expect(200);
    expect(leave.body).toMatchObject({
      groupDeleted: false,
      newLeader: { nickname: '민지', role: 'LEADER', joinOrder: 2 },
    });
    await request(server())
      .get(`/api/trips/${created.tripId}`)
      .set(ctx.auth.headers(junyong))
      .expect(404);
    const junyongList = await request(server())
      .get('/api/me/trips')
      .set(ctx.auth.headers(junyong))
      .expect(200);
    expect(junyongList.body).toEqual({ lastViewedTripId: null, items: [] });

    const taehyunView = await detail(taehyun, created.tripId);
    expect(taehyunView.unseenEvents).toEqual([
      {
        id: expect.any(String),
        type: 'LEADER_CHANGED',
        payload: {
          newLeaderMembershipId: minjiView.me.membershipId,
          nickname: '민지',
        },
      },
    ]);
    await request(server())
      .post(`/api/trips/${created.tripId}/events/ack`)
      .set(ctx.auth.headers(taehyun))
      .send({ lastEventId: taehyunView.unseenEvents[0].id })
      .expect(204);
    expect((await detail(taehyun, created.tripId)).unseenEvents).toEqual([]);

    // 자진 이탈자 재참여: 같은 행(membershipId 유지), joinOrder는 맨 뒤(강퇴된 수빈 4 다음 5), 참여 전 토스트는 안 보임
    const junyongMembershipId = mine.me.membershipId;
    await join(junyong, created.inviteCode).expect(201);
    mine = await detail(junyong, created.tripId);
    expect(mine.me).toMatchObject({
      membershipId: junyongMembershipId,
      role: 'MEMBER',
    });
    expect(mine.members.map((m) => [m.nickname, m.joinOrder])).toEqual([
      ['민지', 2],
      ['태현', 3],
      ['준용', 5],
    ]);
    expect(mine.unseenEvents).toEqual([]);
    expect(
      ctx.events.filter((e) => e.name === 'membership.joined').at(-1)?.payload,
    ).toMatchObject({ rejoined: true });

    // 수정: version 불일치 → 409 + 최신 상세, 맞으면 반영
    let leaderView = await detail(minji, created.tripId);
    expect(leaderView.isLeader).toBe(true);
    const conflict = await request(server())
      .patch(`/api/trips/${created.tripId}`)
      .set(ctx.auth.headers(minji))
      .send({ budgetKrw: 1_500_000, version: leaderView.version + 1 })
      .expect(409);
    expect(conflict.body.code).toBe('VERSION_CONFLICT');
    expect(conflict.body.details.current).toMatchObject({
      tripId: created.tripId,
      version: leaderView.version,
    });
    leaderView = (
      await request(server())
        .patch(`/api/trips/${created.tripId}`)
        .set(ctx.auth.headers(minji))
        .send({
          groupName: '교토 먹방',
          place: { countryCode: 'JP', city: '교토', label: '일본 교토' },
          budgetKrw: 1_500_000,
          version: leaderView.version,
        })
        .expect(200)
    ).body;
    expect(leaderView).toMatchObject({
      groupName: '교토 먹방',
      placeLabel: '일본 교토',
      currency: 'JPY',
      budgetKrw: 1_500_000,
      version: 1,
    });

    // 시작
    const started = await request(server())
      .post(`/api/trips/${created.tripId}/start`)
      .set(ctx.auth.headers(minji))
      .send({ version: leaderView.version })
      .expect(200);
    expect(started.body).toMatchObject({
      status: 'ONGOING',
      todayDayIndex: 1,
      shell: { defaultTab: 'EXPENSES', lockedTabs: [] },
      permissions: {
        canEdit: true,
        editableFields: ['groupName', 'budgetKrw', 'endDate'],
        canEnd: true,
        canDeleteGroup: false,
      },
    });
    const startedEvent = ctx.events.find(
      (e) => e.name === 'trip.started',
    )!.payload;
    expect(startedEvent).toMatchObject({
      tripId: created.tripId,
      groupId: created.groupId,
      startedByUserId: minji.id,
    });
    expect(typeof startedEvent.eventSeq).toBe('bigint');
    expect(startedEvent.startAt).toEqual(trip.startAt);
    await request(server())
      .post(`/api/trips/${created.tripId}/start`)
      .set(ctx.auth.headers(minji))
      .send({ version: started.body.version })
      .expect(409)
      .expect((r) => expect(r.body.code).toBe('TRIP_PHASE_INVALID'));

    // 진행 중: 장소·시작일 잠금, 종료일은 오늘 이후로만, 그룹 삭제 불가
    const locked = await request(server())
      .patch(`/api/trips/${created.tripId}`)
      .set(ctx.auth.headers(minji))
      .send({
        place: { countryCode: 'KR', label: '부산', city: '부산' },
        version: started.body.version,
      })
      .expect(409);
    expect(locked.body).toMatchObject({
      code: 'TRIP_PHASE_INVALID',
      details: { lockedFields: ['place'] },
    });
    await request(server())
      .patch(`/api/trips/${created.tripId}`)
      .set(ctx.auth.headers(minji))
      .send({ endDate: addDays(today, -1), version: started.body.version })
      .expect(400)
      .expect((r) =>
        expect(
          r.body.details.fields.map((f: { code: string }) => f.code),
        ).toContain('endBeforeToday'),
      );
    // 잠긴 항목이라도 지금 값과 같으면 받아 준다
    const extended = await request(server())
      .patch(`/api/trips/${created.tripId}`)
      .set(ctx.auth.headers(minji))
      .send({
        startDate: today,
        endDate: addDays(today, 4),
        version: started.body.version,
      })
      .expect(200);
    expect(extended.body).toMatchObject({
      endDate: addDays(today, 4),
      days: 5,
    });
    await request(server())
      .delete(`/api/groups/${created.groupId}`)
      .set(ctx.auth.headers(minji))
      .expect(409);

    // 종료
    await request(server())
      .get(`/api/trips/${created.tripId}/end-preview`)
      .set(ctx.auth.headers(taehyun))
      .expect(403);
    const endPreview = await request(server())
      .get(`/api/trips/${created.tripId}/end-preview`)
      .set(ctx.auth.headers(minji))
      .expect(200);
    expect(endPreview.body).toEqual({
      pendingCount: 0,
      autoEndAt: `${addDays(today, 4)}T23:59:59+09:00`,
    });
    const ended = await request(server())
      .post(`/api/trips/${created.tripId}/end`)
      .set(ctx.auth.headers(minji))
      .send({ version: extended.body.version })
      .expect(200);
    expect(ended.body).toMatchObject({
      settlementId: null,
      autoPersonalizedCount: 0,
      trip: {
        status: 'ENDED',
        endReason: 'MANUAL',
        inviteCode: null,
        shell: { defaultTab: 'SETTLEMENT', secondTab: 'SETTLEMENT' },
        permissions: {
          canEdit: false,
          canKick: false,
          canInvite: false,
          canStart: false,
          canEnd: false,
          canLeave: true,
        },
      },
    });
    expect(
      ctx.events.find((e) => e.name === 'trip.ended')?.payload,
    ).toMatchObject({
      tripId: created.tripId,
      endedByUserId: minji.id,
      reason: 'MANUAL',
      redelivered: false,
    });

    // 잠금: 종료 후에는 수정·강퇴·시작·참여 불가, 나가기는 된다
    const v = ended.body.trip.version;
    await request(server())
      .patch(`/api/trips/${created.tripId}`)
      .set(ctx.auth.headers(minji))
      .send({ budgetKrw: 1, version: v })
      .expect(409);
    await request(server())
      .post(`/api/trips/${created.tripId}/end`)
      .set(ctx.auth.headers(minji))
      .send({ version: v })
      .expect(409);
    await request(server())
      .delete(
        `/api/groups/${created.groupId}/members/${taehyunView.me.membershipId}`,
      )
      .set(ctx.auth.headers(minji))
      .expect(409);
    const outsider = await ctx.addUser('외부인');
    await join(outsider, created.inviteCode)
      .expect(409)
      .expect((r) => expect(r.body.code).toBe('INVITE_TRIP_ENDED'));
    await request(server())
      .post(`/api/groups/${created.groupId}/leave`)
      .set(ctx.auth.headers(taehyun))
      .expect(200);

    // 상태 변경 이벤트의 eventSeq는 발행 순서대로 커진다
    const seqs = ctx.events
      .filter((e) => e.name !== 'trip.auto-ending')
      .map((e) => e.payload.eventSeq as bigint);
    expect(seqs.every((seq, i) => i === 0 || seq > seqs[i - 1])).toBe(true);
    expect(ctx.events.every((e) => e.payload.occurredAt instanceof Date)).toBe(
      true,
    );
  });

  it('gives distinct joinOrders to concurrent joins', async () => {
    const leader = await ctx.addUser('그룹장');
    const { inviteCode, groupId } = await createTrip(leader);
    const users = await Promise.all(
      ['가', '나', '다', '라', '마', '바'].map((n) => ctx.addUser(n)),
    );

    const results = await Promise.all(users.map((u) => join(u, inviteCode)));
    expect(results.map((r) => r.status)).toEqual(Array(6).fill(201));
    const orders = await ctx.prisma.membership.findMany({
      where: { groupId },
      select: { joinOrder: true },
      orderBy: { joinOrder: 'asc' },
    });
    expect(orders.map((o) => o.joinOrder)).toEqual([1, 2, 3, 4, 5, 6, 7]);
  });

  it('keeps exactly one active leader when the leader and the next member leave at once', async () => {
    const [a, b, c, d] = await Promise.all(
      ['일', '이', '삼', '사'].map((n) => ctx.addUser(n)),
    );
    const { inviteCode, groupId, tripId } = await createTrip(a);
    for (const u of [b, c, d]) await join(u, inviteCode).expect(201);

    const [leaderLeft, nextLeft] = await Promise.all([
      request(server())
        .post(`/api/groups/${groupId}/leave`)
        .set(ctx.auth.headers(a)),
      request(server())
        .post(`/api/groups/${groupId}/leave`)
        .set(ctx.auth.headers(b)),
    ]);
    expect([leaderLeft.status, nextLeft.status]).toEqual([200, 200]);
    const leaders = await ctx.prisma.membership.findMany({
      where: { groupId, role: 'LEADER', leftAt: null },
      select: { userId: true },
    });
    expect(leaders).toEqual([{ userId: c.id }]);
    const events = await ctx.prisma.tripEvent.count({
      where: { tripId, type: 'LEADER_CHANGED' },
    });
    // 그룹장이 먼저 잠그면 b → c 두 번 승계, b가 먼저면 a → c 한 번
    expect(events).toBeGreaterThanOrEqual(1);
  });

  it('puts a rejoining member at the back of the succession order (Q-09)', async () => {
    const [a, b, c] = await Promise.all(
      ['일', '이', '삼'].map((n) => ctx.addUser(n)),
    );
    const { inviteCode, groupId } = await createTrip(a);
    await join(b, inviteCode).expect(201);
    await join(c, inviteCode).expect(201);
    const before = await ctx.prisma.membership.findFirstOrThrow({
      where: { groupId, userId: b.id },
      select: { id: true, joinOrder: true },
    });
    expect(before.joinOrder).toBe(2);

    // b가 나갔다가 다시 들어오면 같은 행, joinOrder는 4(맨 뒤)
    await request(server())
      .post(`/api/groups/${groupId}/leave`)
      .set(ctx.auth.headers(b))
      .expect(200);
    await join(b, inviteCode).expect(201);
    const after = await ctx.prisma.membership.findFirstOrThrow({
      where: { groupId, userId: b.id },
      select: { id: true, joinOrder: true, leftAt: true },
    });
    expect(after).toEqual({ id: before.id, joinOrder: 4, leftAt: null });

    // 그룹장이 나가면 재참여자(b)가 아니라 원래 다음 멤버(c)가 승계
    const leave = await request(server())
      .post(`/api/groups/${groupId}/leave`)
      .set(ctx.auth.headers(a))
      .expect(200);
    expect(leave.body.newLeader).toMatchObject({
      nickname: '삼',
      joinOrder: 3,
    });
    const members = await request(server())
      .get(`/api/groups/${groupId}/members`)
      .set(ctx.auth.headers(b))
      .expect(200);
    expect(
      members.body.map((m: { nickname: string; role: string }) => [
        m.nickname,
        m.role,
      ]),
    ).toEqual([
      ['삼', 'LEADER'],
      ['이', 'MEMBER'],
    ]);
  });

  it('caps the group at 20 active members', async () => {
    const leader = await ctx.addUser('그룹장');
    const { inviteCode, groupId } = await createTrip(leader);
    const others = await Promise.all(
      Array.from({ length: 19 }, (_, i) => ctx.addUser(`멤버${i}`)),
    );
    // StrictThrottle(1분 10회)을 피하려고 DB에 직접 채운다
    await ctx.prisma.membership.createMany({
      data: others.map((u, i) => ({ groupId, userId: u.id, joinOrder: i + 2 })),
    });
    const late = await ctx.addUser('늦은 사람');
    await join(late, inviteCode)
      .expect(409)
      .expect((r) => expect(r.body.code).toBe('MEMBER_LIMIT_EXCEEDED'));
  });

  it('retries invite code collisions and frees the code when the group is deleted', async () => {
    const leader = await ctx.addUser('그룹장');
    const first = await createTrip(leader);
    const generator = app.get(InviteCodeGenerator);
    const spy = vi
      .spyOn(generator, 'next')
      .mockReturnValueOnce(first.inviteCode);

    const second = await createTrip(leader);
    expect(spy).toHaveBeenCalledTimes(2);
    expect(second.inviteCode).not.toBe(first.inviteCode);

    // 그룹 삭제(시작 전·그룹장) → 멤버 전원 membership.left(DELETED), 코드는 다시 쓸 수 있다
    const member = await ctx.addUser('멤버');
    await join(member, first.inviteCode).expect(201);
    await request(server())
      .delete(`/api/groups/${first.groupId}`)
      .set(ctx.auth.headers(member))
      .expect(403);
    await request(server())
      .delete(`/api/groups/${first.groupId}`)
      .set(ctx.auth.headers(leader))
      .expect(204);
    await request(server())
      .get(`/api/trips/${first.tripId}`)
      .set(ctx.auth.headers(member))
      .expect(404);
    await request(server())
      .get(`/api/invites/${first.inviteCode}`)
      .set(ctx.auth.headers(member))
      .expect(404)
      .expect((r) => expect(r.body.code).toBe('INVITE_CODE_INVALID'));
    const deleted = ctx.events.filter((e) => e.name === 'membership.left');
    expect(deleted.map((e) => e.payload.reason)).toEqual([
      'DELETED',
      'DELETED',
    ]);

    spy.mockReturnValueOnce(first.inviteCode);
    const third = await createTrip(leader);
    expect(third.inviteCode).toBe(first.inviteCode);
  });

  it('soft-deletes the group when the last member leaves', async () => {
    const leader = await ctx.addUser('혼자');
    const { groupId, tripId, inviteCode } = await createTrip(leader);
    const res = await request(server())
      .post(`/api/groups/${groupId}/leave`)
      .set(ctx.auth.headers(leader))
      .expect(200);
    expect(res.body).toEqual({ newLeader: null, groupDeleted: true });
    const trip = await ctx.prisma.trip.findUniqueOrThrow({
      where: { id: tripId },
      select: { deletedAt: true },
    });
    expect(trip.deletedAt).not.toBeNull();
    const other = await ctx.addUser('다른 사람');
    await request(server())
      .get(`/api/invites/${inviteCode}`)
      .set(ctx.auth.headers(other))
      .expect(404);
  });

  it('refuses to start a trip whose end date has passed (Q-26)', async () => {
    const leader = await ctx.addUser('그룹장');
    const { tripId } = await createTrip(leader);
    await ctx.prisma.$executeRaw`
      UPDATE trips SET start_at = now() - interval '2 days', auto_end_at = now() - interval '1 minute' WHERE id = ${tripId}::uuid`;
    const view = await detail(leader, tripId);
    expect(view.permissions.canStart).toBe(false);
    await request(server())
      .post(`/api/trips/${tripId}/start`)
      .set(ctx.auth.headers(leader))
      .send({ version: view.version })
      .expect(409)
      .expect((r) => expect(r.body.code).toBe('TRIP_PHASE_INVALID'));
  });

  describe('auto-end job', () => {
    const job = () =>
      request(server())
        .post('/api/internal/jobs/auto-end')
        .set('Origin', 'http://localhost:5173');

    async function ongoingTripDue(leader: AuthUser) {
      const { tripId } = await createTrip(leader);
      await request(server())
        .post(`/api/trips/${tripId}/start`)
        .set(ctx.auth.headers(leader))
        .send({ version: 0 })
        .expect(200);
      await ctx.prisma.$executeRaw`
        UPDATE trips SET start_at = now() - interval '3 days', auto_end_at = now() - interval '1 second' WHERE id = ${tripId}::uuid`;
      return tripId;
    }

    it('rejects calls without the secret', async () => {
      await job()
        .expect(403)
        .expect((r) => expect(r.body.code).toBe('FORBIDDEN'));
      await job().set('x-internal-job-secret', 'wrong').expect(403);
    });

    it('ends due trips once even when two runs overlap', async () => {
      const leader = await ctx.addUser('그룹장');
      const tripId = await ongoingTripDue(leader);
      const notDue = await createTrip(leader);

      const [r1, r2] = await Promise.all([
        job().set('x-internal-job-secret', JOB_SECRET),
        job().set('x-internal-job-secret', JOB_SECRET),
      ]);
      expect([r1.status, r2.status]).toEqual([200, 200]);
      expect([...r1.body.endedTripIds, ...r2.body.endedTripIds]).toEqual([
        tripId,
      ]);

      const trip = await ctx.prisma.trip.findUniqueOrThrow({
        where: { id: tripId },
      });
      expect(trip).toMatchObject({
        status: 'ENDED',
        endReason: 'AUTO',
        endedByMembershipId: null,
      });
      const notDueTrip = await ctx.prisma.trip.findUniqueOrThrow({
        where: { id: notDue.tripId },
      });
      expect(notDueTrip.status).toBe('UPCOMING');

      const ended = ctx.events.filter((e) => e.name === 'trip.ended');
      expect(ended).toHaveLength(1);
      expect(ended[0].payload).toMatchObject({
        tripId,
        endedByUserId: null,
        reason: 'AUTO',
        redelivered: false,
      });
      expect(
        ctx.events.some(
          (e) => e.name === 'trip.auto-ending' && e.payload.tripId === tripId,
        ),
      ).toBe(true);
    });

    it('redelivers trip.ended when the settlement is still missing', async () => {
      const leader = await ctx.addUser('그룹장');
      const tripId = await ongoingTripDue(leader);
      await job().set('x-internal-job-secret', JOB_SECRET).expect(200);

      // 구독자가 없으면 다시 보내지 않는다
      await ctx.prisma
        .$executeRaw`UPDATE trips SET ended_at = now() - interval '10 minutes' WHERE id = ${tripId}::uuid`;
      const none = await job()
        .set('x-internal-job-secret', JOB_SECRET)
        .expect(200);
      expect(none.body).toEqual({ endedTripIds: [], redeliveredTripIds: [] });

      const received: unknown[] = [];
      app
        .get(EventEmitter2)
        .on('trip.ended', (payload: unknown) => received.push(payload));
      const res = await job()
        .set('x-internal-job-secret', JOB_SECRET)
        .expect(200);
      expect(res.body.redeliveredTripIds).toEqual([tripId]);
      expect(received).toEqual([
        expect.objectContaining({ tripId, reason: 'AUTO', redelivered: true }),
      ]);
    });
  });
});
