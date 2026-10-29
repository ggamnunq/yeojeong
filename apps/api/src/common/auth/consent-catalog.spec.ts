import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { CONSENT_ID_VALUES } from '@yeojeong/shared';
import {
  CONSENT_DOCUMENT_VERSIONS,
  currentConsentVersion,
  isConsentSatisfied,
  V1_EFFECTIVE_AT,
  type ConsentDocumentVersion,
} from './consent-catalog.js';

const doc = (
  version: string,
  effectiveAt: string,
  options: { changeType?: 'MAJOR' | 'MINOR'; isDraft?: boolean } = {},
): ConsentDocumentVersion => ({
  consentId: 'TOS',
  version,
  title: '서비스 이용약관',
  required: true,
  docPath: 'docs/legal/서비스 이용약관.md',
  docHash: '0'.repeat(64),
  effectiveAt: new Date(`${effectiveAt}T00:00:00+09:00`),
  changeType: options.changeType ?? 'MAJOR',
  summary: null,
  isDraft: options.isDraft ?? false,
});

const at = (date: string) => new Date(`${date}T12:00:00+09:00`);
const DRAFT = doc('0.1-draft', '2026-10-28', { isDraft: true });

describe('consent validity', () => {
  describe('only drafts exist', () => {
    const catalog = [DRAFT];

    it('treats a draft consent as temporarily valid so signup is not blocked', () => {
      expect(
        currentConsentVersion('TOS', catalog, at('2026-11-01')).version,
      ).toBe('0.1-draft');
      expect(
        isConsentSatisfied('TOS', ['0.1-draft'], catalog, at('2026-11-01')),
      ).toBe(true);
      expect(isConsentSatisfied('TOS', [], catalog, at('2026-11-01'))).toBe(
        false,
      );
    });
  });

  describe('after the first formal version', () => {
    const catalog = [DRAFT, doc('2026-12-01', '2026-12-01')];

    it('asks again everyone who agreed only to the draft', () => {
      expect(
        isConsentSatisfied('TOS', ['0.1-draft'], catalog, at('2026-12-01')),
      ).toBe(false);
      expect(
        currentConsentVersion('TOS', catalog, at('2026-12-01')).version,
      ).toBe('2026-12-01');
    });

    it('accepts a consent to the formal version', () => {
      expect(
        isConsentSatisfied(
          'TOS',
          ['0.1-draft', '2026-12-01'],
          catalog,
          at('2026-12-02'),
        ),
      ).toBe(true);
    });

    it('keeps the draft valid until the formal version takes effect', () => {
      expect(
        isConsentSatisfied('TOS', ['0.1-draft'], catalog, at('2026-11-30')),
      ).toBe(true);
    });
  });

  describe('a newer formal version', () => {
    it('requires a new consent after a MAJOR change', () => {
      const catalog = [
        DRAFT,
        doc('2026-12-01', '2026-12-01'),
        doc('2027-06-01', '2027-06-01'),
      ];
      expect(
        isConsentSatisfied('TOS', ['2026-12-01'], catalog, at('2027-06-01')),
      ).toBe(false);
      expect(
        isConsentSatisfied('TOS', ['2027-06-01'], catalog, at('2027-06-01')),
      ).toBe(true);
    });

    it('keeps the earlier consent after a MINOR change', () => {
      const catalog = [
        DRAFT,
        doc('2026-12-01', '2026-12-01'),
        doc('2027-02-01', '2027-02-01', { changeType: 'MINOR' }),
      ];
      const march = at('2027-03-01');
      expect(isConsentSatisfied('TOS', ['2026-12-01'], catalog, march)).toBe(
        true,
      );
      expect(currentConsentVersion('TOS', catalog, march).version).toBe(
        '2027-02-01',
      );
      expect(isConsentSatisfied('TOS', ['0.1-draft'], catalog, march)).toBe(
        false,
      );
    });
  });

  it('keeps the seed constant equal to the draft rows in the migration', () => {
    const migration = (name: string) =>
      readFileSync(
        fileURLToPath(
          new URL(
            `../../../prisma/migrations/${name}/migration.sql`,
            import.meta.url,
          ),
        ),
        'utf8',
      );
    // 가입·연동 초안 + 카드 승인내역 불러오기(S8) 초안 + 정식 v1.0(L-1)
    const sql =
      migration('20261028101853_add_consent_documents_is_draft') +
      migration('20261029160001_card_import_constraints') +
      migration('20261030010000_consent_documents_v1_0');
    expect([
      ...new Set(CONSENT_DOCUMENT_VERSIONS.map((d) => d.consentId)),
    ]).toEqual(CONSENT_ID_VALUES);
    for (const doc of CONSENT_DOCUMENT_VERSIONS) {
      expect(sql).toContain(
        `('${doc.consentId}', '${doc.version}', '${doc.title}', ${doc.required}, '${doc.docPath}', '${doc.docHash}'`,
      );
    }
  });

  describe('formal v1.0 (L-1)', () => {
    const repoFile = (path: string) =>
      readFileSync(
        fileURLToPath(new URL(`../../../../../${path}`, import.meta.url)),
        'utf8',
      );
    const sha256 = (text: string) =>
      createHash('sha256').update(text, 'utf8').digest('hex');
    const v1 = CONSENT_DOCUMENT_VERSIONS.filter((d) => d.version === '1.0');

    it('publishes TOS·PRIVACY·AGE14 as version 1.0 with a separate effective date (2026-10-30 KST)', () => {
      expect(v1.map((d) => d.consentId)).toEqual(['TOS', 'PRIVACY', 'AGE14']);
      for (const doc of v1) {
        expect(doc).toMatchObject({ isDraft: false, changeType: 'MAJOR' });
        expect(doc.effectiveAt.toISOString()).toBe('2026-10-29T15:00:00.000Z');
      }
      expect(V1_EFFECTIVE_AT).toEqual(new Date('2026-10-30T00:00:00+09:00'));
    });

    it('hashes the published files byte for byte (AGE14 = terms file)', () => {
      // 게시본(웹 content) = docs/legal/v1.0 원문. sync-legal.mjs가 둘을 같게 만든다
      const published: Record<string, string> = {
        TOS: 'apps/web/src/features/legal/content/terms.md',
        PRIVACY: 'apps/web/src/features/legal/content/consent-collection.md',
        AGE14: 'apps/web/src/features/legal/content/terms.md',
      };
      for (const doc of v1) {
        const content = repoFile(published[doc.consentId]);
        expect(sha256(content), doc.consentId).toBe(doc.docHash);
        expect(repoFile(doc.docPath), doc.docPath).toBe(content);
        // docs/legal/v1.0/consents.md 1절 표의 doc_hash 칸도 같은 값
        expect(repoFile('docs/legal/v1.0/consents.md')).toMatch(
          new RegExp(`^\\| \`${doc.consentId}\` \\|.*\`${doc.docHash}\``, 'm'),
        );
      }
    });

    it('asks draft signers to agree again from the effective date (MAJOR)', () => {
      const catalog = CONSENT_DOCUMENT_VERSIONS;
      const before = new Date('2026-10-29T23:59:59+09:00');
      const after = new Date('2026-10-30T00:00:00+09:00');
      for (const id of ['TOS', 'PRIVACY', 'AGE14'] as const) {
        expect(currentConsentVersion(id, catalog, before).version).toBe(
          '0.1-draft',
        );
        expect(isConsentSatisfied(id, ['0.1-draft'], catalog, before)).toBe(
          true,
        );
        expect(currentConsentVersion(id, catalog, after).version).toBe('1.0');
        expect(isConsentSatisfied(id, ['0.1-draft'], catalog, after)).toBe(
          false,
        );
        expect(
          isConsentSatisfied(id, ['0.1-draft', '1.0'], catalog, after),
        ).toBe(true);
      }
      // v1.0에 없는 동의는 초안이 그대로 현재 버전이다
      for (const id of [
        'MARKETING',
        'FIN_LINK',
        'FIN_PRIVACY',
        'THIRD_PARTY',
        'CARD_IMPORT',
      ] as const) {
        expect(currentConsentVersion(id, catalog, after).version).toBe(
          '0.1-draft',
        );
        expect(isConsentSatisfied(id, ['0.1-draft'], catalog, after)).toBe(
          true,
        );
      }
    });
  });

  it('fails loudly when no document is in effect', () => {
    expect(() => currentConsentVersion('TOS', [], at('2026-11-01'))).toThrow();
  });
});
