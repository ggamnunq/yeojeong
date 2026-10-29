import { Injectable, Logger } from '@nestjs/common';
import type {
  CreateTripResponse,
  MyTripsResponse,
  TripDetailResponse,
} from '@yeojeong/shared';
import type { AuthUser, MembershipContext } from '../common/auth/index.js';
import {
  AppException,
  NotFoundError,
  ValidationFailedError,
} from '../common/errors/index.js';
import type { Prisma } from '../generated/prisma/client.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { DomainEventPublisher } from './domain-event.publisher.js';
import type { CreateTripDto, UpdateTripDto } from './dto/trip-request.dto.js';
import { TRIP_EVENTS, type TripStartedEvent } from './events.js';
import { InviteCodeGenerator } from './invite-code.generator.js';
import {
  dateOnly,
  kstDate,
  kstEndOfDay,
  kstStartOfDay,
  parseDateOnly,
} from './kst.js';
import {
  TripVersionMismatch,
  isUniqueViolation,
  versionConflict,
} from './prisma-errors.js';
import { TripDetailService } from './trip-detail.service.js';
import {
  assertStatus,
  lockTrip,
  nextEventSeqs,
  requireActiveMembership,
} from './trip-locks.js';
import { canStartTrip, checkTripPeriod, planTripUpdate } from './trip-rules.js';
import { compareTripListItems, toTripListItem } from './trip-views.js';

/** 초대코드가 우연히 겹칠 때 다시 뽑는 횟수(31^6 공간이라 2번째에서 끝난다) */
const INVITE_CODE_ATTEMPTS = 5;

/** 여정 만들기·목록·수정·시작·1회성 이벤트 확인(FR-201·205·302·303, FR-004). 종료는 TripEndService */
@Injectable()
export class TripsService {
  private readonly logger = new Logger(TripsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly codes: InviteCodeGenerator,
    private readonly detail: TripDetailService,
    private readonly events: DomainEventPublisher,
  ) {}

  /**
   * FR-201: Group + Trip(UPCOMING) + 그룹장 Membership(joinOrder 1)을 한 트랜잭션으로 만든다.
   * 장소는 자유 입력, 통화는 사용자가 고른다(DTO가 지원 통화인지 봤다). place.countryCode·city는 옛 화면 호환으로 저장만 한다
   */
  async create(
    user: AuthUser,
    dto: CreateTripDto,
    now = new Date(),
  ): Promise<CreateTripResponse> {
    const errors = checkTripPeriod(dto.startDate, dto.endDate, {
      today: kstDate(now),
      checkStartPast: true,
    });
    if (errors.length > 0) throw new ValidationFailedError(errors);

    for (let attempt = 1; ; attempt++) {
      const inviteCode = this.codes.next();
      try {
        return await this.prisma.$transaction(async (tx) => {
          const group = await tx.group.create({
            data: { name: dto.groupName, inviteCode, createdByUserId: user.id },
            select: { id: true },
          });
          const trip = await tx.trip.create({
            data: {
              groupId: group.id,
              placeLabel: dto.place.label,
              countryCode: dto.place.countryCode ?? null,
              city: dto.place.city ?? null,
              currency: dto.currency,
              startDate: parseDateOnly(dto.startDate)!,
              endDate: parseDateOnly(dto.endDate)!,
              startAt: kstStartOfDay(dto.startDate),
              autoEndAt: kstEndOfDay(dto.endDate),
              budgetKrw: dto.budgetKrw,
            },
            select: { id: true },
          });
          await tx.membership.create({
            data: {
              groupId: group.id,
              userId: user.id,
              role: 'LEADER',
              joinOrder: 1,
              joinedAt: now,
            },
          });
          return { tripId: trip.id, groupId: group.id, inviteCode };
        });
      } catch (error) {
        if (!isUniqueViolation(error)) throw error;
        if (attempt >= INVITE_CODE_ATTEMPTS) {
          throw AppException.of('CONFLICT', {
            message: '잠시 후 다시 시도해 주세요',
            cause: error,
          });
        }
        this.logger.warn({ attempt }, 'invite code collision, retrying');
      }
    }
  }

  /** FR-205: 내가 활성 멤버인 여정. 나간·삭제된 그룹은 뺀다 */
  async listMine(userId: string): Promise<MyTripsResponse> {
    const [memberships, user] = await Promise.all([
      this.prisma.membership.findMany({
        where: {
          userId,
          leftAt: null,
          group: { deletedAt: null, trip: { deletedAt: null } },
        },
        select: {
          role: true,
          group: {
            select: {
              name: true,
              trip: {
                select: {
                  id: true,
                  groupId: true,
                  status: true,
                  startDate: true,
                  endDate: true,
                },
              },
              _count: { select: { memberships: { where: { leftAt: null } } } },
            },
          },
        },
      }),
      this.prisma.user.findUnique({
        where: { id: userId },
        select: { lastViewedTripId: true },
      }),
    ]);

    const items = memberships
      .filter((m) => m.group.trip !== null)
      .map((m) =>
        toTripListItem(
          { ...m.group.trip!, group: { name: m.group.name } },
          m.group._count.memberships,
          m.role,
        ),
      )
      .sort(compareTripListItems);
    const last = user?.lastViewedTripId ?? null;
    return {
      lastViewedTripId:
        last && items.some((item) => item.tripId === last) ? last : null,
      items,
    };
  }

  /** FR-001·301. 진입 라우팅용 lastViewedTripId도 이 여정으로 바꾼다 */
  async detailForViewer(
    tripId: string,
    me: MembershipContext,
  ): Promise<TripDetailResponse> {
    const detail = await this.detail.build(tripId, me.id);
    await this.prisma.user.updateMany({
      where: {
        id: me.userId,
        OR: [{ lastViewedTripId: null }, { lastViewedTripId: { not: tripId } }],
      },
      data: { lastViewedTripId: tripId },
    });
    return detail;
  }

  /** FR-302: 단계별 허용 항목만, version 낙관적 잠금 */
  async update(
    tripId: string,
    me: MembershipContext,
    dto: UpdateTripDto,
    now = new Date(),
  ): Promise<TripDetailResponse> {
    const { version, ...input } = dto;
    try {
      await this.prisma.$transaction(async (tx) => {
        const locked = await lockTrip(tx, { tripId });
        assertStatus(locked, ['UPCOMING', 'ONGOING']);
        await requireActiveMembership(tx, me.id, locked.groupId, {
          leader: true,
        });
        if (locked.version !== version) throw new TripVersionMismatch();

        const current = await tx.trip.findUniqueOrThrow({
          where: { id: tripId },
          select: {
            placeLabel: true,
            countryCode: true,
            city: true,
            currency: true,
            startDate: true,
            endDate: true,
            budgetKrw: true,
            fxPolicy: true,
            group: { select: { name: true } },
          },
        });
        const plan = planTripUpdate(
          {
            status: locked.status,
            groupName: current.group.name,
            place: {
              countryCode: current.countryCode,
              city: current.city,
              label: current.placeLabel,
            },
            currency: current.currency,
            startDate: dateOnly(current.startDate),
            endDate: dateOnly(current.endDate),
            budgetKrw: current.budgetKrw,
          },
          input,
          kstDate(now),
        );
        if (plan.lockedFields.length > 0) {
          throw AppException.of('TRIP_PHASE_INVALID', {
            message: '지금 단계에서는 바꿀 수 없는 항목이 있어요',
            details: { lockedFields: plan.lockedFields },
          });
        }
        if (plan.fieldErrors.length > 0) {
          throw new ValidationFailedError(plan.fieldErrors);
        }
        if (plan.changed.length === 0) return;

        const { next, changed } = plan;
        const data: Prisma.TripUpdateInput = { version: { increment: 1 } };
        if (changed.includes('place')) {
          data.placeLabel = next.place.label;
          data.countryCode = next.place.countryCode;
          data.city = next.place.city;
        }
        if (changed.includes('currency')) {
          data.currency = next.currency;
          // 시작 전에만 바꿀 수 있어 환산된 결제가 없다. 통화가 바뀌면 고정 환율은 의미가 없어 기본값으로 돌린다
          if (current.fxPolicy === 'FIXED') {
            data.fxPolicy = 'SPOT_AT_PAYMENT';
            data.fxFixedRate = null;
          }
        }
        if (changed.includes('startDate')) {
          data.startDate = parseDateOnly(next.startDate)!;
          data.startAt = kstStartOfDay(next.startDate);
        }
        if (changed.includes('endDate')) {
          data.endDate = parseDateOnly(next.endDate)!;
          data.autoEndAt = kstEndOfDay(next.endDate);
        }
        if (changed.includes('budgetKrw')) data.budgetKrw = next.budgetKrw;
        if (changed.includes('groupName')) {
          data.group = { update: { name: next.groupName } };
        }
        await tx.trip.update({ where: { id: tripId }, data });
      });
    } catch (error) {
      if (error instanceof TripVersionMismatch) {
        throw versionConflict(await this.detail.build(tripId, me.id, now));
      }
      throw error;
    }
    return this.detail.build(tripId, me.id, now);
  }

  /** FR-303: 시작 전 → 진행 중. 커밋 뒤 trip.started(소급 인입은 구독자가 큐에 넣는다) */
  async start(
    tripId: string,
    me: MembershipContext,
    version: number,
    now = new Date(),
  ): Promise<TripDetailResponse> {
    let event: TripStartedEvent;
    try {
      event = await this.prisma.$transaction(async (tx) => {
        const locked = await lockTrip(tx, { tripId });
        assertStatus(locked, ['UPCOMING']);
        const member = await requireActiveMembership(
          tx,
          me.id,
          locked.groupId,
          {
            leader: true,
          },
        );
        if (locked.version !== version) throw new TripVersionMismatch();
        if (!canStartTrip(locked.autoEndAt, now)) {
          throw AppException.of('TRIP_PHASE_INVALID', {
            message: '종료일이 지나 시작할 수 없어요. 기간을 고쳐 주세요',
          });
        }
        await tx.trip.update({
          where: { id: tripId },
          data: {
            status: 'ONGOING',
            startedAt: now,
            startedByMembershipId: me.id,
            version: { increment: 1 },
          },
        });
        const [eventSeq] = await nextEventSeqs(tx, 1);
        return {
          tripId,
          groupId: locked.groupId,
          startedByUserId: member.userId ?? me.userId,
          startAt: locked.startAt,
          eventSeq,
          occurredAt: now,
        };
      });
    } catch (error) {
      if (error instanceof TripVersionMismatch) {
        throw versionConflict(await this.detail.build(tripId, me.id, now));
      }
      throw error;
    }
    await this.events.publish({ name: TRIP_EVENTS.STARTED, payload: event });
    return this.detail.build(tripId, me.id, now);
  }

  /** FR-004: 여기까지 봤다. 뒤로 가지 않는다(더 큰 seq만 기록) */
  async ackEvents(tripId: string, me: MembershipContext, lastEventId: string) {
    const event = await this.prisma.tripEvent.findFirst({
      where: { id: lastEventId, tripId },
      select: { seq: true },
    });
    if (!event) throw new NotFoundError();
    await this.prisma.membership.updateMany({
      where: {
        id: me.id,
        leftAt: null,
        OR: [
          { lastSeenTripEventSeq: null },
          { lastSeenTripEventSeq: { lt: event.seq } },
        ],
      },
      data: { lastSeenTripEventSeq: event.seq },
    });
  }
}
