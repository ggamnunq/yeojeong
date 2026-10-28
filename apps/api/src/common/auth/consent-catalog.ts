import {
  CONSENT_DEFINITIONS,
  type ConsentId,
  type ConsentRequirement,
} from '@yeojeong/shared';

export interface ConsentDocumentVersion {
  consentId: ConsentId;
  /** 시행일 YYYY-MM-DD(같은 날 두 번이면 .2). 초안은 0.1-draft */
  version: string;
  effectiveAt: Date;
  /** MAJOR면 이전 버전 동의로는 부족하다(재동의) */
  changeType: 'MAJOR' | 'MINOR';
  /** docs/legal/ 안의 전문 경로 */
  docPath: string;
  /** 게시한 전문의 SHA-256 */
  docHash: string;
  summary: string | null;
  /** 초안. 운영 DB에 동의 기록으로 남기지 않는다(docs/legal/consents.md 6-1) */
  draft: boolean;
}

const DRAFT_EFFECTIVE_AT = new Date('2026-10-28T00:00:00+09:00');
const TOS_DOC = {
  docPath: 'docs/legal/서비스 이용약관.md',
  docHash: 'a3c2aef236bb1cc2577467871db229de8eac1697376a18b384d9cb26a5b8a1f3',
};
const COLLECTION_DOC = {
  docPath: 'docs/legal/개인정보 수집·이용 동의서.md',
  docHash: '3007c0eae2df11b560ce7f740fe4e13eeee9fbca3804373ab1883932e0373f22',
};
const FIN_LINK_DOC = {
  docPath: 'docs/legal/금융정보 연동 이용약관(부속약관).md',
  docHash: '12754e9251e8aa2313ed9fa7adabbf617d002b394b803c48b7837ce355b5a01a',
};
const THIRD_PARTY_DOC = {
  docPath: 'docs/legal/개인정보 제3자 제공 동의서.md',
  docHash: '3139434ccc3e99aaa30efcbe7941f4fc1eeef295d355e720de43dfda1b065ff9',
};

function draft(
  consentId: ConsentId,
  doc: { docPath: string; docHash: string },
): ConsentDocumentVersion {
  return {
    consentId,
    version: '0.1-draft',
    effectiveAt: DRAFT_EFFECTIVE_AT,
    changeType: 'MAJOR',
    ...doc,
    summary: null,
    draft: true,
  };
}

/**
 * 동의 문서 버전 이력. 새 버전을 낼 때 지우지 말고 뒤에 추가한다(예전 버전 동의를 판단하는 데 쓴다).
 * 시행일이 정해지기 전이라 지금은 초안(0.1-draft)뿐이다.
 */
export const CONSENT_DOCUMENT_VERSIONS: readonly ConsentDocumentVersion[] = [
  draft('TOS', TOS_DOC),
  draft('PRIVACY', COLLECTION_DOC),
  draft('AGE14', TOS_DOC),
  draft('MARKETING', COLLECTION_DOC),
  draft('FIN_LINK', FIN_LINK_DOC),
  draft('FIN_PRIVACY', COLLECTION_DOC),
  draft('THIRD_PARTY', THIRD_PARTY_DOC),
];

type Catalog = readonly ConsentDocumentVersion[];

function effectiveVersions(id: ConsentId, now: Date, catalog: Catalog) {
  return catalog
    .filter((doc) => doc.consentId === id && doc.effectiveAt <= now)
    .sort((a, b) => a.effectiveAt.getTime() - b.effectiveAt.getTime());
}

/** 지금 시행 중인 버전(새로 동의받을 때 기록하는 버전) */
export function currentConsentVersion(
  id: ConsentId,
  now = new Date(),
  catalog: Catalog = CONSENT_DOCUMENT_VERSIONS,
): ConsentDocumentVersion {
  const versions = effectiveVersions(id, now, catalog);
  const current = versions.at(-1);
  if (!current) throw new Error(`시행 중인 ${id} 문서가 없습니다`);
  return current;
}

/**
 * 동의한 버전들로 이 항목이 아직 유효한지 판단한다.
 * 가장 최근 MAJOR 버전과 그 이후 버전에 대한 동의만 유효하다(MINOR 개정은 기존 동의 유지).
 */
export function isConsentSatisfied(
  id: ConsentId,
  agreedVersions: readonly string[],
  now = new Date(),
  catalog: Catalog = CONSENT_DOCUMENT_VERSIONS,
): boolean {
  const versions = effectiveVersions(id, now, catalog);
  const latestMajor = versions.findLastIndex((v) => v.changeType === 'MAJOR');
  const valid = new Set(
    versions.slice(Math.max(latestMajor, 0)).map((v) => v.version),
  );
  return agreedVersions.some((version) => valid.has(version));
}

export function toRequirement(
  id: ConsentId,
  now = new Date(),
): ConsentRequirement {
  return { id, version: currentConsentVersion(id, now).version };
}

export function consentTitle(id: ConsentId): string {
  return CONSENT_DEFINITIONS[id].title;
}
