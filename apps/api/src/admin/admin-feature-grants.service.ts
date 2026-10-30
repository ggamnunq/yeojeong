import { Injectable } from '@nestjs/common';
import {
  ADMIN_FEATURE_GRANT_SEARCH_LIMIT,
  CARD_IMPORT_FETCH_LIMIT,
  CARD_IMPORT_REQUIRED_CONSENTS,
  FEATURE_KEY_VALUES,
  FILE_IMPORT_FEATURE_KEY,
  FILE_IMPORT_PROVIDER_VALUES,
  type AdminFeatureGrantCell,
  type AdminFeatureGrantList,
  type AdminFeatureGrantRow,
  type AdminFeatureGrantSource,
  type AdminFeatureStatus,
  type FeatureKey,
} from '@yeojeong/shared';
import { kstDay } from '../card-import/card-import-limits.js';
import { ConsentChecker } from '../common/auth/index.js';
import { AppException, NotFoundError } from '../common/errors/index.js';
import { FeatureAccess, FeatureFlags } from '../common/features.js';
import { toKstIso } from '../expenses/kst.js';
import { Prisma } from '../generated/prisma/client.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { UUID, type AdminUserQueryKind } from './admin-users.service.js';

const KST_OFFSET_MS = 9 * 60 * 60 * 1000;

interface GrantRow {
  userId: string;
  feature: FeatureKey;
  grantedAt: Date;
  grantedBy: string;
  note: string | null;
}

const grantSelect = {
  userId: true,
  feature: true,
  grantedAt: true,
  grantedBy: true,
  note: true,
} as const;

const isPrismaError = (error: unknown, code: string) =>
  error instanceof Prisma.PrismaClientKnownRequestError && error.code === code;

/**
 * 회원별 기능 권한 관리(관리자 페이지 "기능 권한", ADMIN3). 회원 × 기능 키(FEATURE_KEY_VALUES) 표.
 * 권한은 그 기능의 실제 단계가 allowlist일 때만 쓴다(판정은 FeatureAccess, common/features.ts).
 * 카드 불러오기는 env CARD_IMPORT_ALLOWED_USER_IDS와 합집합이고, env 항목은 보여 주기만 한다(회수 불가 — tfvars에서 빼고 배포).
 * 부여·회수는 되돌릴 수 있어 재인증(step-up)을 받지 않는다.
 * 내보내는 것: 회원 ID·닉네임·기능별 부여 정보·지금 켜짐 여부·CARD_IMPORT 동의 여부·오늘 카드 조회 수(건수만).
 */
@Injectable()
export class AdminFeatureGrantsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly features: FeatureFlags,
    private readonly access: FeatureAccess,
    private readonly consents: ConsentChecker,
  ) {}

  /**
   * 검색이 없으면 권한(관리자·env)이 있는 회원 전부(최근에 권한을 받은 순 → env에만 있는 항목).
   * 검색(닉네임 부분 일치 · 사용자 ID 정확 일치)이면 권한과 무관하게 찾은 회원(가입 최신 순, 상한 ADMIN_FEATURE_GRANT_SEARCH_LIMIT)
   */
  async list(
    rawQuery: string | undefined,
    now = new Date(),
  ): Promise<{ response: AdminFeatureGrantList; kind: AdminUserQueryKind }> {
    const q = rawQuery?.trim() ?? '';
    const kind: AdminUserQueryKind = !q
      ? 'NONE'
      : UUID.test(q)
        ? 'USER_ID'
        : 'NICKNAME';

    let users: { userId: string; nickname: string | null }[];
    let truncated = false;
    if (kind === 'NONE') {
      users = await this.grantedUsers();
    } else {
      const rows = await this.prisma.user.findMany({
        where:
          kind === 'USER_ID'
            ? { id: q.toLowerCase() }
            : { nickname: { contains: q, mode: 'insensitive' } },
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        take: ADMIN_FEATURE_GRANT_SEARCH_LIMIT + 1,
        select: { id: true, nickname: true },
      });
      truncated = rows.length > ADMIN_FEATURE_GRANT_SEARCH_LIMIT;
      users = rows
        .slice(0, ADMIN_FEATURE_GRANT_SEARCH_LIMIT)
        .map((u) => ({ userId: u.id, nickname: u.nickname }));
    }

    const items = await this.rows(users, now);
    return {
      kind,
      response: {
        asOf: toKstIso(now),
        features: FEATURE_KEY_VALUES.map((feature) => this.status(feature)),
        cardImportDailyLimit: CARD_IMPORT_FETCH_LIMIT.DAILY,
        items,
        truncated,
      },
    };
  }

  /**
   * 권한 부여. 없는 회원(탈퇴 포함)이면 404, 이미 관리자 권한이 있으면 409(env에만 있으면 받는다 — env에서 옮겨 올 때).
   * 단계가 allowlist가 아니어도 줄 수 있다(미리 준비해 두고 allowlist로 바꾸면 바로 켜진다). 돌려주는 값은 그 회원의 줄 전체
   */
  async grant(
    userId: string,
    feature: FeatureKey,
    note: string | null,
    actorId: string,
    now = new Date(),
  ): Promise<AdminFeatureGrantRow> {
    const id = userId.toLowerCase();
    const user = UUID.test(id)
      ? await this.prisma.user.findUnique({
          where: { id },
          select: { nickname: true },
        })
      : null;
    if (!user) throw new NotFoundError();
    try {
      await this.prisma.featureGrant.create({
        data: { userId: id, feature, grantedBy: actorId, note },
        select: { userId: true },
      });
    } catch (error) {
      if (isPrismaError(error, 'P2002')) {
        throw AppException.of('ADMIN_FEATURE_GRANT_EXISTS');
      }
      // 확인한 뒤 그 사이에 탈퇴했다(FK)
      if (isPrismaError(error, 'P2003')) throw new NotFoundError();
      throw error;
    }
    const [row] = await this.rows(
      [{ userId: id, nickname: user.nickname }],
      now,
    );
    return row;
  }

  /**
   * 관리자 권한 회수(행 삭제 — 다음 요청부터 바로 꺼진다). 관리자 권한이 없고 env에만 있으면 409 ADMIN_FEATURE_GRANT_ENV_ONLY,
   * 둘 다 없으면 404. env에도 있는 회원이면 관리자 권한만 지워지고 env 권한은 남는다.
   * CARD_IMPORT는 옛 card_import_grants 행도 같은 트랜잭션에서 지운다(옛 리비전으로 되돌려도 되살아나지 않게).
   * 새 표에 없고 옛 표에만 있는 권한(배포 중 옛 화면에서 준 것)도 지우고 성공으로 본다 — 둘 다 없을 때만 404
   */
  async revoke(
    userId: string,
    feature: FeatureKey,
  ): Promise<{ grantedAt: Date }> {
    const id = userId.toLowerCase();
    if (UUID.test(id)) {
      const grantedAt = await this.prisma.$transaction(async (tx) => {
        const current = await tx.featureGrant.findUnique({
          where: { userId_feature: { userId: id, feature } },
          select: { grantedAt: true },
        });
        if (current) {
          await tx.featureGrant.deleteMany({ where: { userId: id, feature } });
        }
        const legacy =
          feature === 'CARD_IMPORT'
            ? await tx.cardImportGrant.findUnique({
                where: { userId: id },
                select: { grantedAt: true },
              })
            : null;
        if (legacy) {
          await tx.cardImportGrant.deleteMany({ where: { userId: id } });
        }
        return current?.grantedAt ?? legacy?.grantedAt ?? null;
      });
      if (grantedAt) return { grantedAt };
    }
    if (this.envSources(id, feature).length > 0) {
      throw AppException.of('ADMIN_FEATURE_GRANT_ENV_ONLY');
    }
    throw new NotFoundError();
  }

  /** 관리자 권한이 있는 회원(최근에 받은 순) → env에만 있는 항목(ID 순) */
  private async grantedUsers(): Promise<
    { userId: string; nickname: string | null }[]
  > {
    const latest = await this.prisma.featureGrant.groupBy({
      by: ['userId'],
      _max: { grantedAt: true },
    });
    latest.sort(
      (a, b) =>
        (b._max.grantedAt?.getTime() ?? 0) -
          (a._max.grantedAt?.getTime() ?? 0) ||
        a.userId.localeCompare(b.userId),
    );
    const granted = latest.map((g) => g.userId);
    const grantedSet = new Set(granted);
    const envOnly = [...this.features.cardImportEnvAllowlist]
      .filter((id) => !grantedSet.has(id))
      .sort();
    const ids = [...granted, ...envOnly];
    if (ids.length === 0) return [];
    const nicknames = new Map(
      (
        await this.prisma.user.findMany({
          where: { id: { in: ids } },
          select: { id: true, nickname: true },
        })
      ).map((u) => [u.id, u.nickname]),
    );
    return ids.map((id) => ({
      userId: id,
      nickname: nicknames.get(id) ?? null,
    }));
  }

  /** 회원들의 표 줄(권한 행·동의·오늘 조회 수를 한 번에 읽는다) */
  private async rows(
    users: { userId: string; nickname: string | null }[],
    now: Date,
  ): Promise<AdminFeatureGrantRow[]> {
    if (users.length === 0) return [];
    const ids = users.map((u) => u.userId);
    const existing = users
      .filter((u) => u.nickname !== null)
      .map((u) => u.userId);
    const [grants, counts, consented] = await Promise.all([
      this.prisma.featureGrant.findMany({
        where: { userId: { in: ids } },
        select: grantSelect,
      }),
      this.todayFetchCounts(ids, now),
      this.consentedUsers(existing),
    ]);
    const byUser = new Map<string, Map<FeatureKey, GrantRow>>();
    for (const g of grants) {
      let map = byUser.get(g.userId);
      if (!map) {
        map = new Map();
        byUser.set(g.userId, map);
      }
      map.set(g.feature, g);
    }
    return users.map(({ userId, nickname }) => {
      const mine = byUser.get(userId) ?? new Map<FeatureKey, GrantRow>();
      const keys = new Set(mine.keys());
      return {
        userId,
        nickname,
        cells: FEATURE_KEY_VALUES.map((feature) =>
          this.cell(userId, feature, mine.get(feature) ?? null, keys),
        ),
        cardImport: {
          consent: consented.has(userId),
          todayFetchCount: counts.get(userId) ?? 0,
        },
      };
    });
  }

  private cell(
    userId: string,
    feature: FeatureKey,
    grant: GrantRow | null,
    keys: ReadonlySet<FeatureKey>,
  ): AdminFeatureGrantCell {
    const sources: AdminFeatureGrantSource[] = [
      ...(grant ? (['ADMIN'] as const) : []),
      ...this.envSources(userId, feature),
    ];
    return {
      feature,
      sources,
      grantedAt: grant ? toKstIso(grant.grantedAt) : null,
      grantedBy: grant?.grantedBy ?? null,
      note: grant?.note ?? null,
      enabled: this.access.enabledWithGrants(userId, feature, keys),
    };
  }

  /** env 허용 목록 출처(지금은 카드 불러오기의 CARD_IMPORT_ALLOWED_USER_IDS만) */
  private envSources(userId: string, feature: FeatureKey): ['ENV'] | [] {
    return feature === 'CARD_IMPORT' &&
      this.features.cardImportEnvAllowlist.has(userId)
      ? ['ENV']
      : [];
  }

  /** 기능 하나의 전역 상태(설정 값 · 실제 단계 · 꺼진 이유 · env 목록 인원) */
  private status(feature: FeatureKey): AdminFeatureStatus {
    if (feature === 'CARD_IMPORT') {
      const configured = this.features.cardImportConfiguredMode;
      const effective = this.features.cardImportMode;
      return {
        feature,
        configuredMode: configured,
        effectiveMode: effective,
        offReason:
          effective === 'off' && configured !== 'off'
            ? 'CODEF_KEYS_MISSING'
            : null,
        envUserCount: this.features.cardImportEnvAllowlist.size,
      };
    }
    const provider = FILE_IMPORT_PROVIDER_VALUES.find(
      (p) => FILE_IMPORT_FEATURE_KEY[p] === feature,
    );
    const configured = this.features.fileImportConfiguredMode;
    const mode = this.features.fileImportMode;
    const providerOn =
      provider !== undefined &&
      this.features.fileImportProviderEnabled(provider);
    const effective = mode !== 'off' && providerOn ? mode : 'off';
    return {
      feature,
      configuredMode: configured,
      effectiveMode: effective,
      offReason:
        configured === 'off'
          ? null
          : mode === 'off'
            ? 'IMPORT_KEY_MISSING'
            : providerOn
              ? null
              : 'PROVIDER_DISABLED',
      envUserCount: 0,
    };
  }

  /** 오늘(KST) 새 조회 수 — CODEF 현황의 사용자별 횟수와 같은 기준(FETCH_CARD_APPROVALS step START) */
  private async todayFetchCounts(
    userIds: string[],
    now: Date,
  ): Promise<Map<string, number>> {
    if (userIds.length === 0) return new Map();
    const todayStart = new Date(kstDay(now).getTime() - KST_OFFSET_MS);
    const rows = await this.prisma.$queryRaw<{ user_id: string; n: number }[]>`
        SELECT user_id::text AS user_id, count(*)::int AS n
        FROM access_logs
        WHERE action = 'FETCH_CARD_APPROVALS' AND at >= ${todayStart}
          AND details->>'step' = 'START'
          AND user_id = ANY(${userIds}::uuid[])
        GROUP BY user_id`;
    return new Map(rows.map((r) => [r.user_id, r.n]));
  }

  /** CARD_IMPORT 동의가 지금 유효한 회원(카드 불러오기 가드와 같은 ConsentChecker 기준) */
  private async consentedUsers(userIds: string[]): Promise<Set<string>> {
    const missing = await Promise.all(
      userIds.map((id) =>
        this.consents.findMissing(id, CARD_IMPORT_REQUIRED_CONSENTS),
      ),
    );
    return new Set(userIds.filter((_, i) => missing[i].length === 0));
  }
}
