import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  ADMIN_USER_PAGE_SIZE,
  type AdminUserDetail,
  type AdminUserListItem,
  type AdminUserListResponse,
  type AdminUserSort,
  type AdminUserStatus,
  type AdminWithdrawUserResponse,
} from '@yeojeong/shared';
import { AccountDeletionService } from '../account/account-deletion.service.js';
import { AppException, NotFoundError } from '../common/errors/index.js';
import { FeatureFlags, parseAllowedUserIds } from '../common/features.js';
import { toKstIso } from '../expenses/kst.js';
import type { Prisma } from '../generated/prisma/client.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { dateOnly } from '../trips/kst.js';

export const UUID =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** 검색 종류(접근 기록에 남긴다 — 검색어 원문은 남기지 않는다) */
export type AdminUserQueryKind = 'NONE' | 'NICKNAME' | 'USER_ID';

interface UserCursor {
  sort: AdminUserSort;
  value: Date;
  id: string;
}

/** 목록 커서 = (정렬 값, id)를 base64url JSON으로 감싼 불투명 문자열. 정렬이 다르면 쓸 수 없다 */
export function encodeUserCursor(cursor: UserCursor): string {
  return Buffer.from(
    JSON.stringify({
      s: cursor.sort,
      v: cursor.value.toISOString(),
      i: cursor.id,
    }),
  ).toString('base64url');
}

export function decodeUserCursor(
  raw: string,
  sort: AdminUserSort,
): UserCursor | null {
  try {
    const parsed: unknown = JSON.parse(
      Buffer.from(raw, 'base64url').toString('utf8'),
    );
    if (typeof parsed !== 'object' || parsed === null) return null;
    const { s, v, i } = parsed as Record<string, unknown>;
    if (
      s !== sort ||
      typeof v !== 'string' ||
      typeof i !== 'string' ||
      !UUID.test(i)
    ) {
      return null;
    }
    const value = new Date(v);
    if (Number.isNaN(value.getTime())) return null;
    return { sort, value, id: i };
  } catch {
    return null;
  }
}

const listSelect = (now: Date) =>
  ({
    id: true,
    nickname: true,
    createdAt: true,
    lastLoginAt: true,
    _count: {
      select: {
        // 참여 중인 여정: 나가지 않았고 그룹이 삭제되지 않은 멤버십(그룹 1 : 여정 1)
        memberships: { where: { leftAt: null, group: { deletedAt: null } } },
        // 지갑 항목 수(내 지갑 화면 Me.walletEntryCount와 같은 기준 walletEntryWhere)
        transactions: { where: { sameUserDuplicateOfId: null } },
      },
    },
    // 처리 전이고 만료 전인 탈퇴 요청(FR-108 요청 코드)
    accountDeletions: {
      where: {
        completedAt: null,
        OR: [{ expiresAt: null }, { expiresAt: { gt: now } }],
      },
      select: { requestedAt: true, expiresAt: true },
      orderBy: { requestedAt: 'desc' },
      take: 1,
    },
  }) satisfies Prisma.UserSelect;

type ListRow = Prisma.UserGetPayload<{ select: ReturnType<typeof listSelect> }>;

/**
 * 관리자 회원 관리. 결제·지갑은 건수만 센다(내용·금액·가맹점은 읽지도 않는다 — 최소 열람).
 * 카카오 회원번호는 끝 4자리만 내보낸다. 탈퇴 처리는 서비스 내 탈퇴와 같은 파이프라인(AccountDeletionService)을 그대로 쓴다.
 */
@Injectable()
export class AdminUsersService {
  private readonly allowlist: ReadonlySet<string>;

  constructor(
    private readonly prisma: PrismaService,
    private readonly features: FeatureFlags,
    private readonly deletion: AccountDeletionService,
    config: ConfigService,
  ) {
    this.allowlist = parseAllowedUserIds(
      config.get<string>('CARD_IMPORT_ALLOWED_USER_IDS'),
    );
  }

  async list(
    query: {
      q?: string;
      sort?: AdminUserSort;
      cursor?: string;
      limit?: number;
    },
    now = new Date(),
  ): Promise<{ response: AdminUserListResponse; kind: AdminUserQueryKind }> {
    const sort = query.sort ?? 'createdAt';
    const limit = query.limit ?? ADMIN_USER_PAGE_SIZE.DEFAULT;
    const q = query.q?.trim() ?? '';
    const kind: AdminUserQueryKind = !q
      ? 'NONE'
      : UUID.test(q)
        ? 'USER_ID'
        : 'NICKNAME';

    const and: Prisma.UserWhereInput[] = [];
    if (kind === 'USER_ID') and.push({ id: q.toLowerCase() });
    if (kind === 'NICKNAME')
      and.push({ nickname: { contains: q, mode: 'insensitive' } });
    if (query.cursor) {
      const cursor = decodeUserCursor(query.cursor, sort);
      if (!cursor) {
        throw AppException.of('VALIDATION_FAILED', {
          details: {
            fields: [
              {
                path: 'cursor',
                code: 'invalid',
                message: '커서가 올바르지 않아요',
              },
            ],
          },
        });
      }
      and.push({
        OR: [
          { [sort]: { lt: cursor.value } },
          { [sort]: cursor.value, id: { lt: cursor.id } },
        ],
      });
    }

    const rows = await this.prisma.user.findMany({
      where: { AND: and },
      orderBy: [{ [sort]: 'desc' }, { id: 'desc' }],
      take: limit + 1,
      select: listSelect(now),
    });
    const page = rows.slice(0, limit);
    const last = page.at(-1);
    return {
      kind,
      response: {
        items: page.map((row) => this.listItem(row)),
        nextCursor:
          rows.length > limit && last
            ? encodeUserCursor({ sort, value: last[sort], id: last.id })
            : null,
      },
    };
  }

  /** 없는 회원(또는 UUID가 아닌 값)이면 null */
  async detail(
    userId: string,
    now = new Date(),
  ): Promise<AdminUserDetail | null> {
    if (!UUID.test(userId)) return null;
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: {
        ...listSelect(now),
        kakaoId: true,
        consents: {
          select: {
            consentId: true,
            version: true,
            agreed: true,
            agreedAt: true,
            withdrawnAt: true,
            withdrawChannel: true,
          },
          orderBy: [{ agreedAt: 'asc' }, { consentId: 'asc' }],
        },
        memberships: {
          select: {
            role: true,
            joinedAt: true,
            leftAt: true,
            group: {
              select: {
                id: true,
                name: true,
                deletedAt: true,
                trip: {
                  select: {
                    id: true,
                    status: true,
                    startDate: true,
                    endDate: true,
                    deletedAt: true,
                  },
                },
              },
            },
          },
          orderBy: { joinedAt: 'desc' },
        },
      },
    });
    if (!user) return null;

    const [expenses, paymentMethods, activeSessions] = await Promise.all([
      this.prisma.expense.count({ where: { payer: { userId } } }),
      this.prisma.paymentMethod.count({
        where: { userId, status: { not: 'REMOVED' } },
      }),
      this.prisma.session.count({
        where: { userId, revokedAt: null, expiresAt: { gt: now } },
      }),
    ]);
    const item = this.listItem(user);
    const pending = user.accountDeletions[0];
    return {
      ...item,
      kakaoIdLast4: user.kakaoId.length >= 4 ? user.kakaoId.slice(-4) : null,
      deletionRequest: pending
        ? {
            requestedAt: toKstIso(pending.requestedAt),
            expiresAt: pending.expiresAt ? toKstIso(pending.expiresAt) : null,
          }
        : null,
      consents: user.consents.map((c) => ({
        consentId: c.consentId,
        version: c.version,
        agreed: c.agreed,
        agreedAt: toKstIso(c.agreedAt),
        withdrawnAt: c.withdrawnAt ? toKstIso(c.withdrawnAt) : null,
        withdrawChannel: c.withdrawChannel,
      })),
      trips: user.memberships.map((m) => {
        const trip = m.group.trip;
        return {
          groupId: m.group.id,
          tripId: trip?.id ?? null,
          name: m.group.name,
          tripStatus: trip?.status ?? null,
          startDate: trip ? dateOnly(trip.startDate) : null,
          endDate: trip ? dateOnly(trip.endDate) : null,
          role: m.role,
          joinedAt: toKstIso(m.joinedAt),
          leftAt: m.leftAt ? toKstIso(m.leftAt) : null,
          deleted:
            m.group.deletedAt !== null || (trip?.deletedAt ?? null) !== null,
        };
      }),
      counts: {
        expenses,
        walletEntries: item.walletEntryCount,
        paymentMethods,
        activeSessions,
      },
    };
  }

  /** 확인 닉네임 검사. 없는 회원이면 404, 다르면 400 ADMIN_CONFIRM_MISMATCH */
  async assertWithdrawable(
    userId: string,
    confirmNickname: string,
  ): Promise<void> {
    const user = UUID.test(userId)
      ? await this.prisma.user.findUnique({
          where: { id: userId },
          select: { nickname: true },
        })
      : null;
    if (!user) throw new NotFoundError();
    if (confirmNickname !== user.nickname) {
      throw AppException.of('ADMIN_CONFIRM_MISMATCH');
    }
  }

  /**
   * 회원 탈퇴 처리: 서비스 내 탈퇴와 같은 파이프라인(세션 폐기·결제수단·거래 원본·개인 결제 파기, 그룹장 승계, 동의 철회, 처리 기록 3년).
   * 경로는 SUPPORT(운영자 처리, FR-108과 같다). 처리 전 탈퇴 요청이 있으면 함께 완료된다. 이미 지워졌으면 404
   */
  async withdraw(userId: string): Promise<AdminWithdrawUserResponse> {
    const result = await this.deletion.deleteAccount(userId, {
      channel: 'SUPPORT',
    });
    if (result.status === 'ALREADY_DELETED') throw new NotFoundError();
    return {
      status: 'DELETED',
      accountDeletionId: result.accountDeletionId,
      completedAt: toKstIso(result.completedAt),
    };
  }

  private listItem(row: ListRow): AdminUserListItem {
    const pending = row.accountDeletions[0];
    const status: AdminUserStatus = pending ? 'DELETION_REQUESTED' : 'ACTIVE';
    return {
      id: row.id,
      nickname: row.nickname,
      createdAt: toKstIso(row.createdAt),
      lastLoginAt: toKstIso(row.lastLoginAt),
      tripCount: row._count.memberships,
      walletEntryCount: row._count.transactions,
      status,
      cardImport: {
        allowlisted: this.allowlist.has(row.id.toLowerCase()),
        enabled: this.features.cardImportFor(row.id),
      },
    };
  }
}
