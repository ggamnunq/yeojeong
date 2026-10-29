import { Injectable } from '@nestjs/common';
import {
  LEGAL_CONSENT_RELEASES,
  type ConsentId,
  type ConsentRequirement,
} from '@yeojeong/shared';
import { PrismaService } from '../../prisma/prisma.service.js';

/** consent_documents 한 행. 새 버전은 마이그레이션으로 행을 추가한다(지우지 않는다) */
export interface ConsentDocumentVersion {
  consentId: ConsentId;
  /** 문서 버전(MVP 기간 0.x: "0.1", "0.2" …). 시행일은 effectiveAt. 초안은 0.1-draft. 게시 당시 표기 1.0 = 0.1 */
  version: string;
  title: string;
  required: boolean;
  docPath: string;
  /** 게시한 전문의 SHA-256 */
  docHash: string;
  effectiveAt: Date;
  /** MAJOR | MINOR — 기록용. 판정은 reconsentRequired */
  changeType: string;
  summary: string | null;
  /** 시행 전 초안. 초안 동의는 법적 유효 동의가 아니다 */
  isDraft: boolean;
  /** true면 이 버전 시행부터 이전 버전 동의로는 부족하다(재동의). 0.x는 번호로 판단하지 않는다 */
  reconsentRequired: boolean;
  /** 같은 문서의 구 표기(0.1 = 구 1.0). 그 표기로 받은 동의를 이 버전 동의로 보고, 구 표기 행은 판정에서 뺀다 */
  replacesVersion: string | null;
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
  reconsentRequired: true,
  replacesVersion: null,
});

/**
 * 정식 약관 시행일(2026-10-30 00:00 KST) — 게시 당시 표기 1.0, 지금 표기 0.1(docs/legal/v0.1).
 * 아래 1.0 행은 그때 게시한 본문(머리 "버전 1.0")의 기록이다. 그 본문은 git 6d8261b의 apps/web/src/features/legal/content/*.md
 */
export const V1_EFFECTIVE_AT = new Date('2026-10-30T00:00:00+09:00');
const V1_TERMS_HASH =
  '97b15008160a8e381efb66222f27487b316d1925c01e6fe54c114cc1aabd7c58';
const V1_PRIVACY_HASH =
  'ad74dea6c6372da76c72bdd546b389e66815e4da6af15ed66cde1addfe33cfd6';
const V1_SUMMARY =
  '정식 약관 v1.0 시행 — 수동 결제·지갑·공동 결제 공개 범위 반영, 연동·카드 불러오기·마케팅 제외';
const v1 = (
  consentId: ConsentId,
  title: string,
  docPath: string,
  docHash: string,
): ConsentDocumentVersion => ({
  consentId,
  version: '1.0',
  title,
  required: true,
  docPath,
  docHash,
  effectiveAt: V1_EFFECTIVE_AT,
  changeType: 'MAJOR',
  summary: V1_SUMMARY,
  isDraft: false,
  reconsentRequired: true,
  replacesVersion: null,
});

/**
 * 마이그레이션이 넣은 consent_documents 행과 같은 값(테스트·픽스처용).
 * - 20261028101853_add_consent_documents_is_draft · 20261029160001_card_import_constraints: 초안(0.1-draft)
 * - 20261030010000_consent_documents_v1_0: 정식 1.0(TOS·PRIVACY·AGE14, 지금 표기 0.1) — 시행일부터 초안 동의자는 재동의
 * - 20261030020000_consent_documents_v0_x: 0.x 재번호(0.1 = 구 1.0, replacesVersion) + 다음 판(0.2 …) — sync-legal.mjs가 만든다
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
  v1(
    'TOS',
    '서비스 이용약관',
    // 게시 당시 경로(1.0 행 = 기록, 지금 파일은 docs/legal/v0.1)
    'docs/legal/v1.0/서비스 이용약관.md',
    V1_TERMS_HASH,
  ),
  v1(
    'PRIVACY',
    '개인정보 수집·이용',
    // 게시 당시 경로(1.0 행 = 기록, 지금 파일은 docs/legal/v0.1)
    'docs/legal/v1.0/개인정보 수집·이용 동의서.md',
    V1_PRIVACY_HASH,
  ),
  v1(
    'AGE14',
    '만 14세 이상입니다',
    // 게시 당시 경로(1.0 행 = 기록, 지금 파일은 docs/legal/v0.1)
    'docs/legal/v1.0/서비스 이용약관.md',
    V1_TERMS_HASH,
  ),
  // 0.x(sync-legal.mjs가 만든 packages/shared legal-manifest.ts = 마이그레이션 20261030020000_consent_documents_v0_x)
  ...LEGAL_CONSENT_RELEASES.map((r): ConsentDocumentVersion => ({
    consentId: r.consentId,
    version: r.version,
    title: r.title,
    required: r.required,
    docPath: r.docPath,
    docHash: r.docHash,
    effectiveAt: new Date(`${r.effectiveDate}T00:00:00+09:00`),
    changeType: r.reconsentRequired ? 'MAJOR' : 'MINOR',
    summary: r.summary,
    isDraft: false,
    reconsentRequired: r.reconsentRequired,
    replacesVersion: r.replacesVersion,
  })),
];

/** 시행 순서: 시행 시각, 같으면 버전 번호(0.1 < 0.2 < 0.10) */
const byEffective = (a: ConsentDocumentVersion, b: ConsentDocumentVersion) =>
  a.effectiveAt.getTime() - b.effectiveAt.getTime() ||
  a.version.localeCompare(b.version, 'en', { numeric: true });

/**
 * 지금 시행 중인 판(오래된 것부터)과 구 표기 → 판.
 * - 구 표기 행(다른 행의 replacesVersion)은 판정에서 빼고, 그 표기로 받은 동의는 대신한 판의 동의로 본다.
 * - 정식본이 하나라도 있으면 초안은 판단에서 뺀다. 정식본이 없을 때만 초안을 임시로 쓴다.
 */
function effective(id: ConsentId, catalog: Catalog, now: Date) {
  const inForce = catalog.filter(
    (doc) => doc.consentId === id && doc.effectiveAt <= now,
  );
  const alias = new Map<string, string>();
  for (const doc of inForce) {
    if (doc.replacesVersion) alias.set(doc.replacesVersion, doc.version);
  }
  const versions = inForce
    .filter((doc) => !alias.has(doc.version))
    .sort(byEffective);
  const formal = versions.filter((doc) => !doc.isDraft);
  return { versions: formal.length > 0 ? formal : versions, alias };
}

/** 지금 동의받을 버전: 시행 중인 최신 정식본, 정식본이 없으면 최신 초안 */
export function currentConsentVersion(
  id: ConsentId,
  catalog: Catalog,
  now = new Date(),
): ConsentDocumentVersion {
  const current = effective(id, catalog, now).versions.at(-1);
  if (!current) throw new Error(`시행 중인 ${id} 문서가 없습니다`);
  return current;
}

/**
 * 동의한 버전들로 이 항목이 지금 유효한지 판단한다.
 * - 재동의가 필요한(reconsentRequired) 가장 최근 판과 그 이후 판에 대한 동의만 유효하다. 재동의가 필요 없는 개정은 기존 동의 유지.
 *   0.x에서는 MAJOR가 늘 0이라 버전 번호로 판단하지 않는다.
 * - 구 표기 동의(예: 1.0)는 그 표기를 대신한 판(0.1)의 동의로 본다. 동의 기록(user_consents)은 고치지 않는다.
 * - 초안 동의는 정식본이 발행되는 순간 무효가 된다. 정식본이 없으면 초안 동의를 임시로 유효하다고 본다(가입을 막지 않기 위해).
 */
export function isConsentSatisfied(
  id: ConsentId,
  agreedVersions: readonly string[],
  catalog: Catalog,
  now = new Date(),
): boolean {
  const { versions, alias } = effective(id, catalog, now);
  const latestRequired = versions.findLastIndex((v) => v.reconsentRequired);
  const valid = new Set(
    versions.slice(Math.max(latestRequired, 0)).map((v) => v.version),
  );
  return agreedVersions.some((version) =>
    valid.has(alias.get(version) ?? version),
  );
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
        reconsentRequired: true,
        replacesVersion: true,
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
