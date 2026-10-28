import { EventEmitter2 } from '@nestjs/event-emitter';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { DELETED_MEMBER_NICKNAME } from '@yeojeong/shared';
import request from 'supertest';
import { AccountDeletionService } from './../src/account/account-deletion.service.js';
import {
  ACCOUNT_DELETING_EVENT,
  MEMBERSHIP_LEFT_EVENT,
  type MembershipLeftEvent,
} from './../src/account/account.events.js';
import { SESSION_COOKIE } from './../src/common/auth/index.js';
import type { PrismaService } from './../src/prisma/prisma.service.js';
import {
  createDbTestApp,
  createExpense,
  createGroupWithTrip,
  createPaymentSetup,
  createSession,
  createSignupConsents,
  createTransaction,
  createUser,
  describeWithDb,
  removeGroups,
} from './account-fixtures.js';
import { TEST_ORIGIN } from './auth-helpers.js';

const cookie = (token: string) => `${SESSION_COOKIE}=${token}`;

describeWithDb('DELETE /api/users/me 서비스 내 탈퇴 (e2e, 실제 DB)', () => {
  let app: NestExpressApplication;
  let db: PrismaService;
  const groupIds: string[] = [];
  const events: { name: string; payload: unknown }[] = [];

  beforeAll(async () => {
    ({ app, db } = await createDbTestApp());
    const emitter = app.get(EventEmitter2);
    emitter.on(ACCOUNT_DELETING_EVENT, (payload: unknown) => {
      events.push({ name: ACCOUNT_DELETING_EVENT, payload });
    });
    emitter.on(MEMBERSHIP_LEFT_EVENT, (payload: unknown) => {
      events.push({ name: MEMBERSHIP_LEFT_EVENT, payload });
    });
  });

  afterAll(async () => {
    await removeGroups(db, groupIds);
    await app.close();
  });

  /** FR-109 수락 기준의 오사카 여정: 준용(그룹장)·민지·태현·수빈 */
  async function seed() {
    const junyong = await createUser(db, { nickname: '준용' });
    const minji = await createUser(db, { nickname: '민지' });
    const taehyun = await createUser(db, { nickname: '태현' });
    const subin = await createUser(db, { nickname: '수빈' });
    const userRefHash = await createSignupConsents(db, junyong.id);
    const pay = await createPaymentSetup(db, junyong.id);
    const tx2 = await createTransaction(db, junyong.id, pay.method.id);

    // 종료된 여정 + 정산 스냅샷
    const ended = await createGroupWithTrip(db, {
      status: 'ENDED',
      members: [junyong, minji, taehyun, subin].map((u) => ({ userId: u.id })),
    });
    const [mJ, mM, mT, mS] = ended.memberships;
    const all = ended.memberships.map((m) => m.id);
    const sharedByJunyong = await createExpense(db, {
      tripId: ended.trip.id,
      payerMembershipId: mJ.id,
      status: 'SHARED',
      krw: 36_400,
      shareMembershipIds: all,
      transactionId: pay.transaction.id,
    });
    const personalByJunyong = await createExpense(db, {
      tripId: ended.trip.id,
      payerMembershipId: mJ.id,
      status: 'PERSONAL',
      krw: 12_000,
      transactionId: tx2.id,
    });
    const sharedByMinji = await createExpense(db, {
      tripId: ended.trip.id,
      payerMembershipId: mM.id,
      status: 'SHARED',
      krw: 54_780,
      shareMembershipIds: all,
    });
    await db.settlement.create({
      data: {
        tripId: ended.trip.id,
        totalSharedKrw: 91_180,
        sharedCount: 2,
        memberCount: 4,
        perCapitaKrw: 22_795,
        fxPolicy: 'SPOT_AT_PAYMENT',
        members: {
          create: [
            {
              membershipId: mJ.id,
              paidKrw: 36_400,
              paidCount: 1,
              burdenKrw: 22_795,
              netKrw: 13_605,
              personalCount: 1,
              isLeft: false,
            },
            {
              membershipId: mM.id,
              paidKrw: 54_780,
              paidCount: 1,
              burdenKrw: 22_795,
              netKrw: 31_985,
              personalCount: 0,
              isLeft: false,
            },
            {
              membershipId: mT.id,
              paidKrw: 0,
              paidCount: 0,
              burdenKrw: 22_795,
              netKrw: -22_795,
              personalCount: 0,
              isLeft: false,
            },
            {
              membershipId: mS.id,
              paidKrw: 0,
              paidCount: 0,
              burdenKrw: 22_795,
              netKrw: -22_795,
              personalCount: 0,
              isLeft: false,
            },
          ],
        },
      },
    });

    // 진행 중인 여정(준용 그룹장 + 민지)
    const ongoing = await createGroupWithTrip(db, {
      status: 'ONGOING',
      members: [{ userId: junyong.id }, { userId: minji.id }],
    });
    const pending = await createExpense(db, {
      tripId: ongoing.trip.id,
      payerMembershipId: ongoing.memberships[0].id,
      status: 'PENDING',
      krw: 5_000,
    });
    const sharedOngoing = await createExpense(db, {
      tripId: ongoing.trip.id,
      payerMembershipId: ongoing.memberships[0].id,
      status: 'SHARED',
      krw: 20_000,
      shareMembershipIds: ongoing.memberships.map((m) => m.id),
    });

    // 준용 혼자인 시작 전 여정
    const solo = await createGroupWithTrip(db, {
      status: 'UPCOMING',
      members: [{ userId: junyong.id }],
    });
    groupIds.push(ended.group.id, ongoing.group.id, solo.group.id);

    // 고객센터 요청 코드(FR-108)로 먼저 요청해 둔 상태
    const supportRequest = await db.accountDeletion.create({
      data: {
        userId: junyong.id,
        userRefHash,
        channel: 'SUPPORT',
        requestCodeHash: randomHex(),
        expiresAt: new Date(Date.now() + 86_400_000),
      },
    });
    const s1 = await createSession(db, junyong.id);
    const s2 = await createSession(db, junyong.id);
    const minjiSession = await createSession(db, minji.id);

    return {
      users: { junyong, minji, taehyun, subin },
      userRefHash,
      pay,
      tx2,
      ended,
      ongoing,
      solo,
      expenses: {
        sharedByJunyong,
        personalByJunyong,
        sharedByMinji,
        pending,
        sharedOngoing,
      },
      supportRequest,
      tokens: { s1: s1.token, s2: s2.token, minji: minjiSession.token },
    };
  }

  it('requires the confirm flag, a session and an allowed Origin', async () => {
    const { users, tokens } = await seed();
    const server = app.getHttpServer();

    const noConfirm = await request(server)
      .delete('/api/users/me')
      .set('Origin', TEST_ORIGIN)
      .set('Cookie', cookie(tokens.s1))
      .expect(400);
    expect(noConfirm.body.code).toBe('VALIDATION_FAILED');

    const noOrigin = await request(server)
      .delete('/api/users/me')
      .set('Cookie', cookie(tokens.s1))
      .send({ confirm: true })
      .expect(403);
    expect(noOrigin.body.code).toBe('CSRF_REJECTED');

    await request(server)
      .delete('/api/users/me')
      .set('Origin', TEST_ORIGIN)
      .send({ confirm: true })
      .expect(401);

    expect(await db.user.count({ where: { id: users.junyong.id } })).toBe(1);
  });

  it('deletes the account, keeps shared records as "탈퇴한 멤버" and passes leadership on', async () => {
    const s = await seed();
    const { junyong, minji } = s.users;
    const server = app.getHttpServer();
    events.length = 0;

    const res = await request(server)
      .delete('/api/users/me')
      .set('Origin', TEST_ORIGIN)
      .set('Cookie', cookie(s.tokens.s1))
      .send({ confirm: true })
      .expect(204);
    // 세션 쿠키 삭제
    expect(String(res.headers['set-cookie'])).toMatch(
      new RegExp(`${SESSION_COOKIE}=;.*Expires=Thu, 01 Jan 1970`),
    );

    // ① 세션 전부 무효: 두 기기 모두 401, 다른 회원은 그대로
    for (const token of [s.tokens.s1, s.tokens.s2]) {
      await request(server)
        .delete('/api/users/me')
        .set('Origin', TEST_ORIGIN)
        .set('Cookie', cookie(token))
        .send({ confirm: true })
        .expect(401);
    }
    await request(server)
      .delete('/api/users/me')
      .set('Origin', TEST_ORIGIN)
      .set('Cookie', cookie(s.tokens.minji))
      .expect(400); // 로그인은 됨(확인 플래그가 없어 400)

    // ⑨ 회원 행·세션 삭제
    expect(await db.user.findUnique({ where: { id: junyong.id } })).toBeNull();
    expect(await db.session.count({ where: { userId: junyong.id } })).toBe(0);

    // ② ③ 연결(토큰)·결제수단·거래 원본·연결 시도·개인/미확정 결제 삭제
    expect(
      await db.paymentConnection.count({ where: { id: s.pay.connection.id } }),
    ).toBe(0);
    expect(
      await db.paymentMethod.count({ where: { id: s.pay.method.id } }),
    ).toBe(0);
    expect(
      await db.transaction.count({
        where: { id: { in: [s.pay.transaction.id, s.tx2.id] } },
      }),
    ).toBe(0);
    expect(
      await db.connectionAttempt.count({ where: { id: s.pay.attempt.id } }),
    ).toBe(0);
    expect(
      await db.expense.count({
        where: {
          id: { in: [s.expenses.personalByJunyong.id, s.expenses.pending.id] },
        },
      }),
    ).toBe(0);

    // ④ 공동 결제·부담·정산은 그대로(원본 거래 연결만 끊김)
    const shared = await db.expense.findUniqueOrThrow({
      where: { id: s.expenses.sharedByJunyong.id },
      include: { shares: true },
    });
    expect(shared).toMatchObject({
      status: 'SHARED',
      netKrwAmount: 36_400,
      transactionId: null,
    });
    expect(shared.shares).toHaveLength(4);
    expect(
      await db.expense.count({ where: { id: s.expenses.sharedOngoing.id } }),
    ).toBe(1);
    expect(
      await db.expenseShare.count({
        where: { expenseId: s.expenses.sharedByMinji.id },
      }),
    ).toBe(4);
    const settlementRows = await db.settlementMember.findMany({
      where: { settlement: { tripId: s.ended.trip.id } },
    });
    expect(settlementRows).toHaveLength(4);
    expect(
      settlementRows.find((r) => r.membershipId === s.ended.memberships[0].id),
    ).toMatchObject({
      paidKrw: 36_400,
      netKrw: 13_605,
    });

    // 멤버십: 계정 연결 끊김 + 나간 멤버
    const myMemberships = await db.membership.findMany({
      where: {
        id: {
          in: [
            s.ended.memberships[0].id,
            s.ongoing.memberships[0].id,
            s.solo.memberships[0].id,
          ],
        },
      },
    });
    expect(myMemberships).toHaveLength(3);
    for (const m of myMemberships) {
      expect(m).toMatchObject({ userId: null, leaveReason: 'LEFT' });
      expect(m.leftAt).toBeInstanceOf(Date);
    }

    // ⑤ 승계: 가입 순 다음(민지)이 그룹장, 1회성 토스트 이벤트
    const newLeader = await db.membership.findUniqueOrThrow({
      where: { id: s.ongoing.memberships[1].id },
    });
    expect(newLeader).toMatchObject({
      userId: minji.id,
      role: 'LEADER',
      leftAt: null,
    });
    const toast = await db.tripEvent.findFirstOrThrow({
      where: { tripId: s.ongoing.trip.id, type: 'LEADER_CHANGED' },
    });
    expect(toast.payload).toEqual({
      newLeaderMembershipId: s.ongoing.memberships[1].id,
      nickname: '민지',
    });
    expect(toast.actorMembershipId).toBe(s.ongoing.memberships[0].id);

    // ⑤ 혼자였던 시작 전 그룹은 소프트 삭제(30일 뒤 파기 배치)
    const solo = await db.group.findUniqueOrThrow({
      where: { id: s.solo.group.id },
      include: { trip: true },
    });
    expect(solo.deletedAt).toBeInstanceOf(Date);
    expect(solo.trip?.deletedAt).toBeInstanceOf(Date);
    expect(solo.createdByUserId).toBeNull();

    // ⑦ 동의 철회 기록(행은 3년 보존)
    const consents = await db.userConsent.findMany({
      where: { userRefHash: s.userRefHash },
    });
    expect(consents).toHaveLength(4);
    for (const c of consents) {
      expect(c).toMatchObject({
        userId: null,
        withdrawChannel: 'ACCOUNT_DELETED',
      });
      expect(c.withdrawnAt).toBeInstanceOf(Date);
    }

    // ⑧ 처리 기록: IN_APP 완료 + 먼저 와 있던 고객센터 요청도 완료
    const deletions = await db.accountDeletion.findMany({
      where: { userRefHash: s.userRefHash },
      orderBy: { requestedAt: 'asc' },
    });
    expect(deletions.map((d) => d.channel).sort()).toEqual([
      'IN_APP',
      'SUPPORT',
    ]);
    for (const d of deletions) {
      expect(d.userId).toBeNull();
      expect(d.completedAt).toBeInstanceOf(Date);
    }

    // 감사 로그: ID만
    const logs = await db.accessLog.findMany({ where: { userId: junyong.id } });
    expect(logs).toEqual([
      expect.objectContaining({
        action: 'DELETE_ACCOUNT',
        resourceType: 'USER',
        resourceId: junyong.id,
      }),
    ]);

    // 이벤트: 트랜잭션 전 account.deleting, 커밋 후 membership.left(reason DELETED) 3건
    expect(events[0]).toEqual({
      name: ACCOUNT_DELETING_EVENT,
      payload: { userId: junyong.id, channel: 'IN_APP' },
    });
    const left = events
      .filter((e) => e.name === MEMBERSHIP_LEFT_EVENT)
      .map((e) => e.payload as MembershipLeftEvent);
    expect(left).toHaveLength(3);
    // S2A membership.left와 같은 모양: 탈퇴는 reason DELETED, userId null
    expect(left.find((e) => e.groupId === s.ongoing.group.id)).toEqual({
      tripId: s.ongoing.trip.id,
      groupId: s.ongoing.group.id,
      membershipId: s.ongoing.memberships[0].id,
      userId: null,
      reason: 'DELETED',
      eventSeq: expect.any(BigInt),
      occurredAt: expect.any(Date),
    });
    expect(left.every((e) => e.reason === 'DELETED' && e.userId === null)).toBe(
      true,
    );
    // eventSeq는 같은 여정의 승계 토스트(TripEvent)보다 뒤
    expect(
      left.find((e) => e.groupId === s.ongoing.group.id)!.eventSeq,
    ).toBeGreaterThan(toast.seq);

    // 같은 카카오 계정은 신규 가입으로 다시 들어올 수 있다(FR-109 수락 기준 2)
    const again = await db.user.create({
      data: { kakaoId: junyong.kakaoId, nickname: '준용' },
    });
    expect(again.id).not.toBe(junyong.id);
    await db.user.delete({ where: { id: again.id } });

    // 멱등: 이미 지운 회원은 아무것도 바꾸지 않는다
    await expect(
      app
        .get(AccountDeletionService)
        .deleteAccount(junyong.id, { channel: 'IN_APP' }),
    ).resolves.toEqual({ status: 'ALREADY_DELETED' });
  });

  it('scrubs the nickname from an earlier leader-change toast when the new leader leaves too', async () => {
    const s = await seed();
    const server = app.getHttpServer();
    await request(server)
      .delete('/api/users/me')
      .set('Origin', TEST_ORIGIN)
      .set('Cookie', cookie(s.tokens.s1))
      .send({ confirm: true })
      .expect(204);

    // 민지도 탈퇴: 진행 중 그룹은 아무도 안 남아 소프트 삭제, 종료 그룹은 태현이 승계
    await request(server)
      .delete('/api/users/me')
      .set('Origin', TEST_ORIGIN)
      .set('Cookie', cookie(s.tokens.minji))
      .send({ confirm: true })
      .expect(204);

    const toasts = await db.tripEvent.findMany({
      where: { tripId: s.ongoing.trip.id, type: 'LEADER_CHANGED' },
    });
    expect(toasts).toHaveLength(1);
    expect(toasts[0].payload).toEqual({
      newLeaderMembershipId: s.ongoing.memberships[1].id,
      nickname: DELETED_MEMBER_NICKNAME,
    });
    const ongoing = await db.group.findUniqueOrThrow({
      where: { id: s.ongoing.group.id },
    });
    expect(ongoing.deletedAt).toBeInstanceOf(Date);

    const endedLeader = await db.membership.findFirstOrThrow({
      where: { groupId: s.ended.group.id, role: 'LEADER', leftAt: null },
    });
    expect(endedLeader.userId).toBe(s.users.taehyun.id);
  });

  it('handles two simultaneous requests from the same user once', async () => {
    const s = await seed();
    const server = app.getHttpServer();
    const send = (token: string) =>
      request(server)
        .delete('/api/users/me')
        .set('Origin', TEST_ORIGIN)
        .set('Cookie', cookie(token))
        .send({ confirm: true });

    const results = await Promise.all([send(s.tokens.s1), send(s.tokens.s2)]);
    // 둘 다 가드를 통과했으면 204·204, 한쪽이 늦게 도착했으면 세션이 없어 401
    expect(results.map((r) => r.status)).toContain(204);
    for (const r of results) expect([204, 401]).toContain(r.status);
    expect(
      await db.accountDeletion.count({
        where: { userRefHash: s.userRefHash, channel: 'IN_APP' },
      }),
    ).toBe(1);
  });
});

function randomHex() {
  return Array.from({ length: 64 }, () =>
    Math.floor(Math.random() * 16).toString(16),
  ).join('');
}
