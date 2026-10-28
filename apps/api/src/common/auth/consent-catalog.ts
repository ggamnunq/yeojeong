import { Injectable } from '@nestjs/common';
import type { ConsentId, ConsentRequirement } from '@yeojeong/shared';
import { PrismaService } from '../../prisma/prisma.service.js';

/** consent_documents 한 행. 새 버전은 마이그레이션으로 행을 추가한다(지우지 않는다) */
export interface ConsentDocumentVersion {
  consentId: ConsentId;
  /** 시행일 YYYY-MM-DD(같은 날 두 번이면 .2). 초안은 0.1-draft */
  version: string;
  title: string;
  required: boolean;
  docPath: string;
  /** 게시한 전문의 SHA-256 */
  docHash: string;
  effectiveAt: Date;
  /** MAJOR면 이전 버전 동의로는 부족하다(재동의) */
  changeType: string;
  summary: string | null;
  /** 시행 전 초안. 초안 동의는 법적 유효 동의가 아니다 */
  isDraft: boolean;
}

type Catalog = readonly ConsentDocumentVersion[];

function effective(id: ConsentId, catalog: Catalog, now: Date) {
  const versions = catalog
    .filter((doc) => doc.consentId === id && doc.effectiveAt <= now)
    .sort((a, b) => a.effectiveAt.getTime() - b.effectiveAt.getTime());
  const formal = versions.filter((doc) => !doc.isDraft);
  // 정식본이 하나라도 있으면 초안은 판단에서 뺀다. 정식본이 없을 때만 초안을 임시로 쓴다.
  return formal.length > 0 ? formal : versions;
}

/** 지금 동의받을 버전: 시행 중인 최신 정식본, 정식본이 없으면 최신 초안 */
export function currentConsentVersion(
  id: ConsentId,
  catalog: Catalog,
  now = new Date(),
): ConsentDocumentVersion {
  const current = effective(id, catalog, now).at(-1);
  if (!current) throw new Error(`시행 중인 ${id} 문서가 없습니다`);
  return current;
}

/**
 * 동의한 버전들로 이 항목이 지금 유효한지 판단한다.
 * - 정식본이 있으면: 가장 최근 정식 MAJOR 버전과 그 이후 정식 버전에 대한 동의만 유효하다(MINOR 개정은 기존 동의 유지).
 *   초안 동의는 정식본이 발행되는 순간 무효가 된다.
 * - 정식본이 없으면: 초안 동의를 임시로 유효하다고 본다(가입을 막지 않기 위해).
 */
export function isConsentSatisfied(
  id: ConsentId,
  agreedVersions: readonly string[],
  catalog: Catalog,
  now = new Date(),
): boolean {
  const versions = effective(id, catalog, now);
  const latestMajor = versions.findLastIndex((v) => v.changeType === 'MAJOR');
  const valid = new Set(
    versions.slice(Math.max(latestMajor, 0)).map((v) => v.version),
  );
  return agreedVersions.some((version) => valid.has(version));
}

const CACHE_MS = 60_000;

/** consent_documents를 읽어 1분 캐시한다. 새 버전은 배포(마이그레이션) 때만 바뀐다 */
@Injectable()
export class ConsentCatalog {
  private cache?: { loadedAt: number; docs: ConsentDocumentVersion[] };

  constructor(private readonly prisma: PrismaService) {}

  async load(): Promise<ConsentDocumentVersion[]> {
    if (this.cache && Date.now() - this.cache.loadedAt < CACHE_MS) {
      return this.cache.docs;
    }
    const docs = await this.prisma.consentDocument.findMany({
      select: {
        consentId: true,
        version: true,
        title: true,
        required: true,
        docPath: true,
        docHash: true,
        effectiveAt: true,
        changeType: true,
        summary: true,
        isDraft: true,
      },
    });
    this.cache = { loadedAt: Date.now(), docs };
    return docs;
  }

  async current(id: ConsentId): Promise<ConsentDocumentVersion> {
    return currentConsentVersion(id, await this.load());
  }

  async requirement(id: ConsentId): Promise<ConsentRequirement> {
    return { id, version: (await this.current(id)).version };
  }
}
