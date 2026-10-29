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

const DRAFT_EFFECTIVE_AT = new Date('2026-10-28T00:00:00+09:00');
const draft = (
  consentId: ConsentId,
  title: string,
  required: boolean,
  docPath: string,
  docHash: string,
): ConsentDocumentVersion => ({
  consentId,
  version: '0.1-draft',
  title,
  required,
  docPath,
  docHash,
  effectiveAt: DRAFT_EFFECTIVE_AT,
  changeType: 'MAJOR',
  summary: null,
  isDraft: true,
});

/**
 * 마이그레이션 20261028101853_add_consent_documents_is_draft가 넣은 초안 행과 같은 값(테스트·픽스처용).
 * 서버의 판정 기준은 이 상수가 아니라 consent_documents 테이블이다(ConsentCatalog).
 */
export const CONSENT_DOCUMENT_VERSIONS: Catalog = [
  draft(
    'TOS',
    '서비스 이용약관',
    true,
    'docs/legal/서비스 이용약관.md',
    'a3c2aef236bb1cc2577467871db229de8eac1697376a18b384d9cb26a5b8a1f3',
  ),
  draft(
    'PRIVACY',
    '개인정보 수집·이용',
    true,
    'docs/legal/개인정보 수집·이용 동의서.md',
    '3007c0eae2df11b560ce7f740fe4e13eeee9fbca3804373ab1883932e0373f22',
  ),
  draft(
    'AGE14',
    '만 14세 이상입니다',
    true,
    'docs/legal/서비스 이용약관.md',
    'a3c2aef236bb1cc2577467871db229de8eac1697376a18b384d9cb26a5b8a1f3',
  ),
  draft(
    'MARKETING',
    '마케팅 정보 수신',
    false,
    'docs/legal/개인정보 수집·이용 동의서.md',
    '3007c0eae2df11b560ce7f740fe4e13eeee9fbca3804373ab1883932e0373f22',
  ),
  draft(
    'FIN_LINK',
    '금융정보 연동 약관',
    true,
    'docs/legal/금융정보 연동 이용약관(부속약관).md',
    '12754e9251e8aa2313ed9fa7adabbf617d002b394b803c48b7837ce355b5a01a',
  ),
  draft(
    'FIN_PRIVACY',
    '금융정보 수집·이용',
    true,
    'docs/legal/개인정보 수집·이용 동의서.md',
    '3007c0eae2df11b560ce7f740fe4e13eeee9fbca3804373ab1883932e0373f22',
  ),
  draft(
    'THIRD_PARTY',
    '공동 결제 그룹 공개',
    true,
    'docs/legal/개인정보 제3자 제공 동의서.md',
    '3139434ccc3e99aaa30efcbe7941f4fc1eeef295d355e720de43dfda1b065ff9',
  ),
  // 마이그레이션 20261029160001_card_import_constraints(S8). 전문이 아직 없어 docHash는 summary의 SHA-256
  {
    ...draft(
      'CARD_IMPORT',
      '카드 승인내역 불러오기',
      true,
      'docs/legal/카드 승인내역 불러오기 동의서.md',
      'b21259dea64a8caaf60564f52967c940214eb12c4fa2aff947447c3c89e041a8',
    ),
    effectiveAt: new Date('2026-10-29T00:00:00+09:00'),
    summary:
      '카드사 로그인 정보로 승인내역을 한 번 조회하고, 고른 결제만 지갑에 저장해요. 로그인 정보와 조회 결과는 저장하지 않아요.',
  },
];

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
