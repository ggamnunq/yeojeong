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
        where: {
          userId,
          consentId: { in: [...consentIds] },
          agreed: true,
          withdrawnAt: null,
        },
        select: { consentId: true, version: true },
      }),
    ]);
    const now = new Date();
    return consentIds
      .filter((id) => {
        const versions = rows
          .filter((row) => row.consentId === id)
          .map((row) => row.version);
        return !isConsentSatisfied(id, versions, docs, now);
      })
      .map((id) => ({
        id,
        version: currentConsentVersion(id, docs, now).version,
      }));
  }
}
