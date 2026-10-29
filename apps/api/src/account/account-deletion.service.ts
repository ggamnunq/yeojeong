import { Injectable, Logger, Optional } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { EventEmitter2 } from '@nestjs/event-emitter';
import type { AccountDeletionChannel } from '@yeojeong/shared';
import { Prisma } from '../generated/prisma/client.js';
import { PrismaService } from '../prisma/prisma.service.js';
import {
  ACCOUNT_DELETED_WITHDRAW_CHANNEL,
  SCRUBBED_LEADER_NICKNAME,
  anonymizedMembership,
  planLeave,
} from './account-deletion.plan.js';
import {
  ACCOUNT_DELETED_EVENT,
  ACCOUNT_DELETING_EVENT,
  MEMBERSHIP_LEFT_EVENT,
  type AccountDeletedEvent,
  type AccountDeletingEvent,
  type MembershipLeftEvent,
} from './account.events.js';
import { resolveUserRefHash } from './user-ref.js';

type Tx = Prisma.TransactionClient;

export interface DeleteAccountCounts {
  sessions: number;
  connections: number;
  connectionAttempts: number;
  paymentMethods: number;
  transactions: number;
  personalExpenses: number;
  membershipsLeft: number;
  leadersSucceeded: number;
  groupsSoftDeleted: number;
  consentsWithdrawn: number;
  /** 관리자 페이지에서 준 카드 불러오기 권한(0 또는 1) */
  cardImportGrants: number;
}

export type DeleteAccountResult =
  | {
      status: 'DELETED';
      accountDeletionId: string;
      completedAt: Date;
      leftMemberships: MembershipLeftEvent[];
      counts: DeleteAccountCounts;
    }
  /** 이미 지워진 회원(동시 요청·재시도). 아무것도 바꾸지 않는다 */
  | { status: 'ALREADY_DELETED' };

// Cloud Run 요청 제한(30초) 안에서 끝나게 둔다
const TX_OPTIONS = { timeout: 20_000, maxWait: 5_000 } as const;

/**
 * 탈퇴 파이프라인(기능명세 FR-109, docs/legal README 6-1). 서비스 내 탈퇴, 고객센터 요청 처리(FR-108),
 * 장기 미이용 파기(8-8 7단계)가 같은 함수를 쓴다. 한 트랜잭션이고, 이미 지워진 회원이면 아무것도 하지 않는다(멱등).
 *
 * 1. account.deleting 이벤트(트랜잭션 전, 외부 정리: 제공기관 토큰 폐기·카카오 연결 끊기)
 * 2. 트랜잭션: User 행 잠금 → 활성 멤버십의 Trip 행 잠금(S2A와 같은 순서) → 멤버십 익명화·승계·빈 그룹 소프트 삭제 →
 *    PENDING·PERSONAL 결제 삭제 → 거래 원본·결제수단·연결 시도·연결(토큰 포함) 삭제 → 세션·카드 불러오기 권한 삭제 →
 *    동의 철회 기록 → AccountDeletion 완료 기록 → User 삭제
 * 3. membership.left(reason ACCOUNT_DELETED)·account.deleted 이벤트(커밋 후)
 */
@Injectable()
export class AccountDeletionService {
  private readonly logger = new Logger(AccountDeletionService.name);
  private readonly userRefKey: string | undefined;

  constructor(
    private readonly prisma: PrismaService,
    config: ConfigService,
    // 앱 모듈의 EventEmitterModule.forRoot()가 준다. 없는 테스트 앱에서는 이벤트 없이 동작한다
    @Optional() private readonly events?: EventEmitter2,
  ) {
    this.userRefKey = config.get<string>('USER_REF_HMAC_KEY') || undefined;
  }

  async deleteAccount(
    userId: string,
    {
      channel,
      now = new Date(),
    }: { channel: AccountDeletionChannel; now?: Date },
  ): Promise<DeleteAccountResult> {
    const exists = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { id: true },
    });
    if (!exists) return { status: 'ALREADY_DELETED' };

    await this.notifyDeleting({ userId, channel });

    const result = await this.prisma.$transaction(
      (tx) => this.runPipeline(tx, userId, channel, now),
      TX_OPTIONS,
    );
    if (result.status === 'ALREADY_DELETED') return result;

    this.logger.log(
      {
        userId,
        accountDeletionId: result.accountDeletionId,
        channel,
        ...result.counts,
      },
      '탈퇴 처리 완료',
    );
    for (const event of result.leftMemberships) {
      await this.emit(MEMBERSHIP_LEFT_EVENT, event);
    }
    await this.emit(ACCOUNT_DELETED_EVENT, {
      userId,
      accountDeletionId: result.accountDeletionId,
      channel,
      completedAt: result.completedAt,
    } satisfies AccountDeletedEvent);
    return result;
  }

  private async runPipeline(
    tx: Tx,
    userId: string,
    channel: AccountDeletionChannel,
    now: Date,
  ): Promise<DeleteAccountResult> {
    // 같은 회원의 동시 탈퇴는 여기서 줄 선다. 늦은 쪽은 행이 없으니 ALREADY_DELETED
    const locked = await tx.$queryRaw<{ kakao_id: string }[]>`
      SELECT kakao_id FROM users WHERE id = ${userId}::uuid FOR UPDATE`;
    if (locked.length === 0) return { status: 'ALREADY_DELETED' };
    const kakaoId = locked[0].kakao_id;

    const userRefHash = await resolveUserRefHash(tx, userId, this.userRefKey);
    const memberships = await tx.membership.findMany({
      where: { userId },
      select: { id: true, groupId: true, leftAt: true },
    });
    const membershipIds = memberships.map((m) => m.id);

    const {
      leftMemberships,
      membershipsLeft,
      leadersSucceeded,
      groupsSoftDeleted,
    } = await this.leaveGroups(tx, memberships, now);
    await tx.membership.updateMany({
      where: { userId },
      data: { userId: null },
    });
    if (membershipIds.length > 0) {
      await this.scrubLeaderNicknames(tx, membershipIds);
    }

    // ③ 개인·미확정 결제는 즉시 파기(취소 자식은 부모와 같은 상태·결제자라 함께 지워진다).
    //   공동 결제·부담(ExpenseShare)은 남기고, 원본 거래가 지워지면 transactionId만 NULL이 된다(FK SET NULL).
    const personalExpenses = await tx.expense.deleteMany({
      where: {
        payerMembershipId: { in: membershipIds },
        status: { in: ['PENDING', 'PERSONAL'] },
      },
    });
    const transactions = await tx.transaction.deleteMany({ where: { userId } });
    const paymentMethods = await tx.paymentMethod.deleteMany({
      where: { userId },
    });
    const connectionAttempts = await tx.connectionAttempt.deleteMany({
      where: { userId },
    });
    // ② 연결 행째 지운다(토큰 컬럼 포함). User FK가 RESTRICT라 남겨 둘 수 없다. SyncRun은 CASCADE
    const connections = await tx.paymentConnection.deleteMany({
      where: { userId },
    });
    // ① 세션 전부(User CASCADE로도 지워지지만 순서를 드러내려고 먼저 지운다)
    const sessions = await tx.session.deleteMany({ where: { userId } });
    await tx.signupTicket.deleteMany({ where: { kakaoId } });
    // 관리자 페이지에서 준 카드 불러오기 권한(User CASCADE로도 지워지지만 파기 대상임을 드러내려고 먼저 지운다)
    const cardImportGrants = await tx.cardImportGrant.deleteMany({
      where: { userId },
    });

    // ⑦ 동의 철회 기록. 행은 3년 보존 후 파기 배치가 지운다(미동의 행도 철회 시각을 채워 기간 계산에 넣는다)
    const consents = await tx.userConsent.updateMany({
      where: { userId, withdrawnAt: null },
      data: {
        withdrawnAt: now,
        withdrawChannel: ACCOUNT_DELETED_WITHDRAW_CHANNEL,
      },
    });

    const accountDeletionId = await this.recordDeletion(
      tx,
      userId,
      userRefHash,
      channel,
      now,
    );

    // ⑨ 회원 정보는 "탈퇴까지"(보존표) → 행을 지운다. 동의·처리 기록·멤버십·그룹 생성자 FK는 SET NULL
    await tx.user.delete({ where: { id: userId } });

    return {
      status: 'DELETED',
      accountDeletionId,
      completedAt: now,
      leftMemberships,
      counts: {
        sessions: sessions.count,
        connections: connections.count,
        connectionAttempts: connectionAttempts.count,
        paymentMethods: paymentMethods.count,
        transactions: transactions.count,
        personalExpenses: personalExpenses.count,
        membershipsLeft,
        leadersSucceeded,
        groupsSoftDeleted,
        consentsWithdrawn: consents.count,
        cardImportGrants: cardImportGrants.count,
      },
    };
  }

  /** ⑤ 활성 멤버십마다: 나간 멤버로 만들고, 그룹장이면 승계, 마지막 멤버면 그룹·여정 소프트 삭제 */
  private async leaveGroups(
    tx: Tx,
    memberships: { id: string; groupId: string; leftAt: Date | null }[],
    now: Date,
  ) {
    const active = memberships.filter((m) => m.leftAt === null);
    const leftMemberships: MembershipLeftEvent[] = [];
    let leadersSucceeded = 0;
    let groupsSoftDeleted = 0;
    const result = () => ({
      leftMemberships,
      membershipsLeft: active.length,
      leadersSucceeded,
      groupsSoftDeleted,
    });
    if (active.length === 0) return result();

    // 나가기·강퇴·참여(S2A)와 같은 순서로 잠근다: Trip 행 → Membership 행(그룹 1 : 여정 1이라 Trip 잠금이 그룹 잠금을 겸한다).
    // 여러 여정이면 교착을 피하려고 id 순서로
    const groupIds = [...new Set(active.map((m) => m.groupId))].sort();
    await tx.$queryRaw`
      SELECT id FROM trips
      WHERE group_id IN (${Prisma.join(groupIds.map((id) => Prisma.sql`${id}::uuid`))})
      ORDER BY id FOR UPDATE`;
    const groups = await tx.group.findMany({
      where: { id: { in: groupIds } },
      select: {
        id: true,
        deletedAt: true,
        trip: { select: { id: true, deletedAt: true } },
        memberships: {
          where: { leftAt: null },
          select: {
            id: true,
            role: true,
            joinOrder: true,
            user: { select: { nickname: true } },
          },
        },
      },
    });

    for (const mine of active) {
      const group = groups.find((g) => g.id === mine.groupId);
      if (!group) continue;
      const plan = planLeave(group.memberships, mine.id);
      const groupAlive = group.deletedAt === null;
      const trip =
        group.trip && group.trip.deletedAt === null ? group.trip : null;

      // 내 행을 먼저 비워야 활성 그룹장 부분 유니크(그룹당 1명)에 걸리지 않는다
      await tx.membership.update({
        where: { id: mine.id },
        data: anonymizedMembership(null, now),
      });

      if (groupAlive && plan.successor) {
        await tx.membership.update({
          where: { id: plan.successor.id },
          data: { role: 'LEADER' },
        });
        leadersSucceeded += 1;
        if (trip) {
          const successor = group.memberships.find(
            (m) => m.id === plan.successor?.id,
          );
          await tx.tripEvent.create({
            data: {
              tripId: trip.id,
              type: 'LEADER_CHANGED',
              payload: {
                newLeaderMembershipId: plan.successor.id,
                nickname: successor?.user?.nickname ?? SCRUBBED_LEADER_NICKNAME,
              },
              actorMembershipId: mine.id,
            },
          });
        }
      }

      if (groupAlive && plan.groupBecomesEmpty) {
        await tx.group.update({
          where: { id: group.id },
          data: { deletedAt: now },
        });
        if (trip) {
          await tx.trip.update({
            where: { id: trip.id },
            data: { deletedAt: now },
          });
        }
        groupsSoftDeleted += 1;
      }

      // 이미 삭제된 그룹·여정이면 구독자(S2B 인입 중단)가 할 일이 없어 보내지 않는다
      if (groupAlive && trip) {
        leftMemberships.push({
          tripId: trip.id,
          groupId: group.id,
          membershipId: mine.id,
          userId: null,
          reason: 'ACCOUNT_DELETED',
          eventSeq: await nextEventSeq(tx),
          occurredAt: now,
        });
      }
    }
    return result();
  }

  /** 내가 승계받았던 토스트 이벤트의 닉네임을 지운다(1회성 토스트 페이로드에 남은 개인정보) */
  private async scrubLeaderNicknames(tx: Tx, membershipIds: string[]) {
    await tx.$executeRaw`
      UPDATE trip_events
      SET payload = jsonb_set(payload, '{nickname}', to_jsonb(${SCRUBBED_LEADER_NICKNAME}::text)),
          updated_at = now()
      WHERE type = 'LEADER_CHANGED'
        AND payload->'nickname' IS NOT NULL
        AND payload->>'newLeaderMembershipId' IN (${Prisma.join(membershipIds)})`;
  }

  /**
   * ⑧ 처리 기록(완료 + 3년 보관). 처리 전인 요청(FR-108 요청 코드 등)은 이번 처리로 완료한다.
   * 같은 경로의 요청이 있었으면 그 행이 기록이고, 없으면 새 행을 만든다.
   */
  private async recordDeletion(
    tx: Tx,
    userId: string,
    userRefHash: string,
    channel: AccountDeletionChannel,
    now: Date,
  ): Promise<string> {
    const pending = await tx.accountDeletion.findMany({
      where: { userId, completedAt: null },
      select: { id: true, channel: true },
      orderBy: { requestedAt: 'asc' },
    });
    if (pending.length > 0) {
      await tx.accountDeletion.updateMany({
        where: { id: { in: pending.map((p) => p.id) } },
        data: { completedAt: now },
      });
    }
    const sameChannel = pending.find((p) => p.channel === channel);
    if (sameChannel) return sameChannel.id;
    const created = await tx.accountDeletion.create({
      data: {
        userId: null,
        userRefHash,
        channel,
        requestedAt: now,
        completedAt: now,
      },
      select: { id: true },
    });
    return created.id;
  }

  private async notifyDeleting(event: AccountDeletingEvent) {
    if (!this.events) return;
    try {
      await this.events.emitAsync(ACCOUNT_DELETING_EVENT, event);
    } catch (err) {
      this.logger.warn(
        {
          userId: event.userId,
          errorName: err instanceof Error ? err.name : typeof err,
        },
        '탈퇴 전 외부 정리 실패(탈퇴는 계속 진행)',
      );
    }
  }

  /** 커밋 후 발행(S2A와 같이 emitAsync). 구독자 오류는 탈퇴 결과에 영향을 주지 않는다 */
  private async emit(name: string, payload: object) {
    if (!this.events) {
      this.logger.warn(
        { event: name },
        'EventEmitterModule이 없어 이벤트를 보내지 않음',
      );
      return;
    }
    try {
      await this.events.emitAsync(name, payload);
    } catch (err) {
      this.logger.error(
        {
          event: name,
          errorName: err instanceof Error ? err.name : typeof err,
        },
        '이벤트 리스너 오류',
      );
    }
  }
}

/** S2A와 같은 순서 번호: trip_events.seq 시퀀스에서 받는다(Trip 행을 잠근 뒤라 여정 안에서 커밋 순서와 같다) */
async function nextEventSeq(tx: Tx): Promise<bigint> {
  const [row] = await tx.$queryRaw<{ seq: bigint }[]>`
    SELECT nextval(pg_get_serial_sequence('trip_events', 'seq')) AS seq`;
  return BigInt(row.seq);
}
