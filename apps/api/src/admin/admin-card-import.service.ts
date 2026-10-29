import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  CARD_IMPORT_FETCH_LIMIT,
  CARD_IMPORT_REQUIRED_CONSENTS,
  type AdminCardImportGrant,
  type AdminCardImportGrantList,
  type AdminCardImportGrantSource,
} from '@yeojeong/shared';
import { kstDay } from '../card-import/card-import-limits.js';
import { ConsentChecker } from '../common/auth/index.js';
import { AppException, NotFoundError } from '../common/errors/index.js';
import { FeatureFlags, parseCardImportMode } from '../common/features.js';
import { toKstIso } from '../expenses/kst.js';
import { Prisma } from '../generated/prisma/client.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { UUID } from './admin-users.service.js';

const KST_OFFSET_MS = 9 * 60 * 60 * 1000;

interface GrantRow {
  userId: string;
  grantedAt: Date;
  grantedBy: string;
  note: string | null;
}

const isPrismaError = (error: unknown, code: string) =>
  error instanceof Prisma.PrismaClientKnownRequestError && error.code === code;

/**
 * 카드 승인내역 불러오기(S8) 권한 관리(관리자 페이지). FEATURE_CARD_IMPORT=allowlist일 때
 * env CARD_IMPORT_ALLOWED_USER_IDS와 card_import_grants의 합집합이 켜진다(판정은 CardImportAccess, common/features.ts).
 * env 항목은 보여 주기만 하고 회수할 수 없다(tfvars에서 빼고 배포). 부여·회수는 되돌릴 수 있어 재인증(step-up)을 받지 않는다.
 * 내보내는 것: 회원 ID·닉네임·부여 정보·CARD_IMPORT 동의 여부·오늘 조회 수(건수만 — 조회 내용은 원래 저장하지 않는다).
 */
@Injectable()
export class AdminCardImportService {
  private readonly featureCardImport: string;

  constructor(
    private readonly prisma: PrismaService,
    private readonly features: FeatureFlags,
    private readonly consents: ConsentChecker,
    config: ConfigService,
  ) {
    this.featureCardImport = parseCardImportMode(
      config.get<string>('FEATURE_CARD_IMPORT'),
    );
  }

  async list(now = new Date()): Promise<AdminCardImportGrantList> {
    const grants = await this.prisma.cardImportGrant.findMany({
      select: {
        userId: true,
        grantedAt: true,
        grantedBy: true,
        note: true,
        user: { select: { nickname: true } },
      },
      orderBy: [{ grantedAt: 'desc' }, { userId: 'asc' }],
    });
    const granted = new Set(grants.map((g) => g.userId));
    const envOnlyIds = [...this.features.cardImportEnvAllowlist]
      .filter((id) => !granted.has(id))
      .sort();
    const envUsers = new Map(
      envOnlyIds.length === 0
        ? []
        : (
            await this.prisma.user.findMany({
              where: { id: { in: envOnlyIds } },
              select: { id: true, nickname: true },
            })
          ).map((u) => [u.id, u.nickname]),
    );

    const rows: {
      grant: GrantRow | null;
      userId: string;
      nickname: string | null;
    }[] = [
      ...grants.map((g) => ({
        grant: g,
        userId: g.userId,
        nickname: g.user.nickname,
      })),
      ...envOnlyIds.map((id) => ({
        grant: null,
        userId: id,
        nickname: envUsers.get(id) ?? null,
      })),
    ];
    const existing = rows
      .filter((r) => r.nickname !== null)
      .map((r) => r.userId);
    const [counts, consented] = await Promise.all([
      this.todayFetchCounts(
        rows.map((r) => r.userId),
        now,
      ),
      this.consentedUsers(existing),
    ]);
    return {
      asOf: toKstIso(now),
      flags: {
        featureCardImport: this.featureCardImport,
        effectiveMode: this.features.cardImportMode,
      },
      dailyLimit: CARD_IMPORT_FETCH_LIMIT.DAILY,
      items: rows.map((r) =>
        this.item(r.userId, r.nickname, r.grant, {
          consent: consented.has(r.userId),
          todayFetchCount: counts.get(r.userId) ?? 0,
        }),
      ),
    };
  }

  /** 권한 부여. 없는 회원(탈퇴 포함)이면 404, 이미 관리자 권한이 있으면 409(env에만 있으면 받는다 — env에서 옮겨 올 때) */
  async grant(
    userId: string,
    note: string | null,
    actorId: string,
    now = new Date(),
  ): Promise<AdminCardImportGrant> {
    const id = userId.toLowerCase();
    const user = UUID.test(id)
      ? await this.prisma.user.findUnique({
          where: { id },
          select: { nickname: true },
        })
      : null;
    if (!user) throw new NotFoundError();
    let row: GrantRow;
    try {
      row = await this.prisma.cardImportGrant.create({
        data: { userId: id, grantedBy: actorId, note },
        select: { userId: true, grantedAt: true, grantedBy: true, note: true },
      });
    } catch (error) {
      if (isPrismaError(error, 'P2002')) {
        throw AppException.of('ADMIN_CARD_IMPORT_GRANT_EXISTS');
      }
      // 확인한 뒤 그 사이에 탈퇴했다(FK)
      if (isPrismaError(error, 'P2003')) throw new NotFoundError();
      throw error;
    }
    const [counts, consented] = await Promise.all([
      this.todayFetchCounts([id], now),
      this.consentedUsers([id]),
    ]);
    return this.item(id, user.nickname, row, {
      consent: consented.has(id),
      todayFetchCount: counts.get(id) ?? 0,
    });
  }

  /**
   * 관리자 권한 회수(행 삭제 — 다음 요청부터 바로 꺼진다). 관리자 권한이 없고 env에만 있으면 409 ADMIN_CARD_IMPORT_GRANT_ENV_ONLY,
   * 둘 다 없으면 404. env에도 있는 회원이면 관리자 권한만 지워지고 env 권한은 남는다
   */
  async revoke(userId: string): Promise<{ grantedAt: Date }> {
    const id = userId.toLowerCase();
    if (UUID.test(id)) {
      try {
        return await this.prisma.cardImportGrant.delete({
          where: { userId: id },
          select: { grantedAt: true },
        });
      } catch (error) {
        if (!isPrismaError(error, 'P2025')) throw error;
      }
    }
    if (this.features.cardImportEnvAllowlist.has(id)) {
      throw AppException.of('ADMIN_CARD_IMPORT_GRANT_ENV_ONLY');
    }
    throw new NotFoundError();
  }

  private item(
    userId: string,
    nickname: string | null,
    grant: GrantRow | null,
    extra: { consent: boolean; todayFetchCount: number },
  ): AdminCardImportGrant {
    const sources: AdminCardImportGrantSource[] = [];
    if (grant) sources.push('ADMIN');
    if (this.features.cardImportEnvAllowlist.has(userId)) sources.push('ENV');
    return {
      userId,
      nickname,
      sources,
      grantedAt: grant ? toKstIso(grant.grantedAt) : null,
      grantedBy: grant?.grantedBy ?? null,
      note: grant?.note ?? null,
      revocable: grant !== null,
      cardImportConsent: extra.consent,
      todayFetchCount: extra.todayFetchCount,
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
