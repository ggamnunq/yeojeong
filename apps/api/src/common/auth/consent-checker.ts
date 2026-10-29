import { Injectable } from '@nestjs/common';
import type { ConsentId, ConsentRequirement } from '@yeojeong/shared';
import { PrismaService } from '../../prisma/prisma.service.js';
import {
  ConsentCatalog,
  currentConsentVersion,
  isConsentSatisfied,
} from './consent-catalog.js';

/**
 * 사용자에게 아직 유효한 동의가 없는 항목을 찾는다. ConsentGuard와 auth·consents 모듈이 쓴다.
 * 테스트는 test/auth-helpers.ts의 StubConsentChecker로 바꿔 끼운다.
 */
export abstract class ConsentChecker {
  /** 비어 있으면 모두 유효하다. 결과는 consentIds 순서를 따른다 */
  abstract findMissing(
    userId: string,
    consentIds: readonly ConsentId[],
  ): Promise<ConsentRequirement[]>;
}

/** 판정에 쓰는 동의 이력 행 */
export interface ConsentHistoryRow {
  consentId: ConsentId;
  version: string;
  agreed: boolean;
  agreedAt: Date;
  withdrawnAt: Date | null;
  createdAt: Date;
}

/**
 * 이 항목에서 지금 유효한 버전 목록(기능명세 4-10 v0.5.7, docs/legal/consents.md 4절).
 * 버전마다 가장 최근 행(agreedAt 최대, 같으면 createdAt)만 보고, 그 행이 agreed이고 철회되지 않았을 때만 유효하다.
 * 철회 뒤 다시 동의하면 새 행이 쌓이므로(append) 최신 행이 유효해지고, 철회된 옛 행은 기록으로 남는다.
 */
export function validConsentVersions(
  rows: readonly ConsentHistoryRow[],
  consentId: ConsentId,
): string[] {
  const latest = new Map<string, ConsentHistoryRow>();
  for (const row of rows) {
    if (row.consentId !== consentId) continue;
    const current = latest.get(row.version);
    if (
      !current ||
      row.agreedAt.getTime() > current.agreedAt.getTime() ||
      (row.agreedAt.getTime() === current.agreedAt.getTime() &&
        row.createdAt.getTime() > current.createdAt.getTime())
    ) {
      latest.set(row.version, row);
    }
  }
  return [...latest.values()]
    .filter((row) => row.agreed && row.withdrawnAt === null)
    .map((row) => row.version);
}

@Injectable()
export class PrismaConsentChecker extends ConsentChecker {
  constructor(
    private readonly prisma: PrismaService,
    private readonly catalog: ConsentCatalog,
  ) {
    super();
  }

  async findMissing(
    userId: string,
    consentIds: readonly ConsentId[],
  ): Promise<ConsentRequirement[]> {
    if (consentIds.length === 0) return [];
    const [docs, rows] = await Promise.all([
      this.catalog.load(),
      this.prisma.userConsent.findMany({
        where: { userId, consentId: { in: [...consentIds] } },
        select: {
          consentId: true,
          version: true,
          agreed: true,
          agreedAt: true,
          withdrawnAt: true,
          createdAt: true,
        },
      }),
    ]);
    const now = new Date();
    return consentIds
      .filter(
        (id) =>
          !isConsentSatisfied(id, validConsentVersions(rows, id), docs, now),
      )
      .map((id) => ({
        id,
        version: currentConsentVersion(id, docs, now).version,
      }));
  }
}
