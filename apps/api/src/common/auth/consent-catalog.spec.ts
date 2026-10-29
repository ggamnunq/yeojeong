import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import {
  CONSENT_ID_VALUES,
  LEGAL_CONSENT_RELEASES,
  LEGAL_DOCUMENT_VERSIONS,
} from '@yeojeong/shared';
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
  options: {
    reconsentRequired?: boolean;
    isDraft?: boolean;
    replacesVersion?: string;
  } = {},
): ConsentDocumentVersion => ({
  consentId: 'TOS',
  version,
  title: '서비스 이용약관',
  required: true,
  docPath: 'docs/legal/서비스 이용약관.md',
  docHash: '0'.repeat(64),
  effectiveAt: new Date(`${effectiveAt}T00:00:00+09:00`),
  changeType: options.reconsentRequired === false ? 'MINOR' : 'MAJOR',
  summary: null,
  isDraft: options.isDraft ?? false,
  reconsentRequired: options.reconsentRequired ?? true,
  replacesVersion: options.replacesVersion ?? null,
});

const at = (date: string) => new Date(`${date}T12:00:00+09:00`);
const DRAFT = doc('0.1-draft', '2026-10-28', { isDraft: true });

const repoFile = (path: string) =>
  readFileSync(
    fileURLToPath(new URL(`../../../../../${path}`, import.meta.url)),
    'utf8',
  );
const sha256 = (text: string) =>
  createHash('sha256').update(text, 'utf8').digest('hex');
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
    const catalog = [DRAFT, doc('0.1', '2026-12-01')];

    it('asks again everyone who agreed only to the draft', () => {
      expect(
        isConsentSatisfied('TOS', ['0.1-draft'], catalog, at('2026-12-01')),
      ).toBe(false);
      expect(
        currentConsentVersion('TOS', catalog, at('2026-12-01')).version,
      ).toBe('0.1');
    });

    it('accepts a consent to the formal version', () => {
      expect(
        isConsentSatisfied(
          'TOS',
          ['0.1-draft', '0.1'],
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

  describe('a newer formal version: the per-version reconsentRequired flag decides, not the number', () => {
    it('requires a new consent when the new version says so (even 0.1 → 0.2)', () => {
      const catalog = [
        DRAFT,
        doc('0.1', '2026-12-01'),
        doc('0.2', '2027-06-01', { reconsentRequired: true }),
      ];
      expect(
        isConsentSatisfied('TOS', ['0.1'], catalog, at('2027-05-31')),
      ).toBe(true);
      expect(
        isConsentSatisfied('TOS', ['0.1'], catalog, at('2027-06-01')),
      ).toBe(false);
      expect(
        isConsentSatisfied('TOS', ['0.2'], catalog, at('2027-06-01')),
      ).toBe(true);
    });

    it('keeps the earlier consent when the new version does not require it (even 0.9 → 1.0)', () => {
      const catalog = [
        DRAFT,
        doc('0.9', '2026-12-01'),
        doc('1.0', '2027-02-01', { reconsentRequired: false }),
      ];
      const march = at('2027-03-01');
      expect(isConsentSatisfied('TOS', ['0.9'], catalog, march)).toBe(true);
      expect(currentConsentVersion('TOS', catalog, march).version).toBe('1.0');
      expect(isConsentSatisfied('TOS', ['0.1-draft'], catalog, march)).toBe(
        false,
      );
    });

    it('orders versions effective on the same day by number', () => {
      const catalog = [
        doc('0.2', '2026-12-01', { reconsentRequired: false }),
        doc('0.1', '2026-12-01'),
      ];
      expect(
        currentConsentVersion('TOS', catalog, at('2026-12-01')).version,
      ).toBe('0.2');
      expect(
        isConsentSatisfied('TOS', ['0.1'], catalog, at('2026-12-01')),
      ).toBe(true);
    });
  });

  describe('relabelled version (replacesVersion)', () => {
    const catalog = [
      DRAFT,
      doc('1.0', '2026-10-30'),
      doc('0.1', '2026-10-30', { replacesVersion: '1.0' }),
      doc('0.2', '2026-11-02', { reconsentRequired: false }),
    ];

    it('treats a consent recorded as 1.0 as a consent to 0.1 and never serves the old label', () => {
      for (const date of ['2026-10-30', '2026-11-02', '2027-01-01']) {
        expect(isConsentSatisfied('TOS', ['1.0'], catalog, at(date))).toBe(
          true,
        );
        expect(
          isConsentSatisfied('TOS', ['0.1-draft'], catalog, at(date)),
        ).toBe(false);
      }
      expect(
        currentConsentVersion('TOS', catalog, at('2026-10-30')).version,
      ).toBe('0.1');
      expect(
        currentConsentVersion('TOS', catalog, at('2026-11-02')).version,
      ).toBe('0.2');
    });

    it('does not let the old label outrank a later reconsent', () => {
      const strict = [
        ...catalog,
        doc('0.3', '2027-01-01', { reconsentRequired: true }),
      ];
      expect(isConsentSatisfied('TOS', ['1.0'], strict, at('2027-01-01'))).toBe(
        false,
      );
    });
  });

  it('matches versions exactly — "0.1-draft" and "0.1" never stand for each other', () => {
    const draftOnly = [DRAFT];
    expect(
      isConsentSatisfied('TOS', ['0.1'], draftOnly, at('2026-11-01')),
    ).toBe(false);
    const formal = [DRAFT, doc('0.1', '2026-10-30')];
    for (const agreed of ['0.1-draft', '0.1 ', '0.10', '0', '1.0']) {
      expect(
        isConsentSatisfied('TOS', [agreed], formal, at('2026-11-01')),
        agreed,
      ).toBe(false);
    }
    expect(isConsentSatisfied('TOS', ['0.1'], formal, at('2026-11-01'))).toBe(
      true,
    );
    // 구 표기는 replacesVersion으로 정한 것만(1.0 → 0.1)
    const relabelled = [
      DRAFT,
      doc('1.0', '2026-10-30'),
      doc('0.1', '2026-10-30', { replacesVersion: '1.0' }),
    ];
    expect(
      isConsentSatisfied('TOS', ['1.0'], relabelled, at('2026-11-01')),
    ).toBe(true);
    expect(isConsentSatisfied('TOS', ['1'], relabelled, at('2026-11-01'))).toBe(
      false,
    );
  });

  it('fails loudly when no document is in effect', () => {
    expect(() => currentConsentVersion('TOS', [], at('2026-11-01'))).toThrow();
  });
});

describe('consent document catalog', () => {
  it('keeps the seed constant equal to the rows in the migrations', () => {
    // 가입·연동 초안 + 카드 승인내역 불러오기(S8) 초안 + 정식 1.0(L-1) + 0.x 재번호·다음 판(L-1b, sync-legal.mjs가 만든다)
    const sql =
      migration('20261028101853_add_consent_documents_is_draft') +
      migration('20261029160001_card_import_constraints') +
      migration('20261030010000_consent_documents_v1_0') +
      migration('20261030020000_consent_documents_v0_x');
    expect([
      ...new Set(CONSENT_DOCUMENT_VERSIONS.map((d) => d.consentId)),
    ]).toEqual(CONSENT_ID_VALUES);
    for (const d of CONSENT_DOCUMENT_VERSIONS) {
      expect(sql).toContain(
        `('${d.consentId}', '${d.version}', '${d.title}', ${d.required}, '${d.docPath}', '${d.docHash}'`,
      );
    }
    // 0.x 행: 시행 시각·재동의 필요·구 표기까지 같다
    for (const r of LEGAL_CONSENT_RELEASES) {
      expect(sql).toContain(
        `'${r.docHash}', '${r.effectiveDate}T00:00:00+09:00', '${r.reconsentRequired ? 'MAJOR' : 'MINOR'}', '${r.summary}', false, ${r.reconsentRequired}, ${r.replacesVersion === null ? 'NULL' : `'${r.replacesVersion}'`})`,
      );
    }
    // 기존 행은 change_type으로 재동의 필요를 채운다
    expect(sql).toContain(
      `UPDATE "consent_documents" SET "reconsent_required" = ("change_type" = 'MAJOR');`,
    );
  });

  it('hashes every 0.x consent document from its published web copy byte for byte', () => {
    for (const r of LEGAL_CONSENT_RELEASES) {
      const published = Object.values(LEGAL_DOCUMENT_VERSIONS)
        .flat()
        .find((v) => v.sha256 === r.docHash && v.version === r.version);
      expect(published, `${r.consentId} ${r.version}`).toBeDefined();
      const content = repoFile(
        `apps/web/src/features/legal/content/${published!.path}`,
      );
      expect(sha256(content), `${r.consentId} ${r.version}`).toBe(r.docHash);
      expect(published!.effectiveDate).toBe(r.effectiveDate);
      // 게시본 머리 줄 = 버전·시행일
      expect(content).toContain(
        `버전 ${r.version} · 시행일 ${r.effectiveDate}`,
      );
      // 그 판 consents.md 1절 표의 doc_hash 칸도 같은 값
      const dir = r.docPath.split('/')[2];
      expect(repoFile(`docs/legal/${dir}/consents.md`)).toMatch(
        new RegExp(`^\\| \`${r.consentId}\` \\|.*\`${r.docHash}\``, 'm'),
      );
    }
  });

  describe('0.1 = the 1.0 published on 2026-10-30 (renumbered)', () => {
    const v01 = CONSENT_DOCUMENT_VERSIONS.filter((d) => d.version === '0.1');
    const v1 = CONSENT_DOCUMENT_VERSIONS.filter((d) => d.version === '1.0');

    it('relabels TOS·PRIVACY·AGE14 1.0 as 0.1 with the same effective date (reconsent for draft signers)', () => {
      for (const id of ['TOS', 'PRIVACY', 'AGE14'] as const) {
        expect(v01.find((d) => d.consentId === id)).toMatchObject({
          isDraft: false,
          reconsentRequired: true,
          replacesVersion: '1.0',
          docPath: expect.stringMatching(/^docs\/legal\/v0\.1\//),
        });
        expect(v01.find((d) => d.consentId === id)!.effectiveAt).toEqual(
          V1_EFFECTIVE_AT,
        );
      }
      // AGE14 = 이용약관 파일
      expect(v01.find((d) => d.consentId === 'AGE14')!.docHash).toBe(
        v01.find((d) => d.consentId === 'TOS')!.docHash,
      );
    });

    it('keeps the 1.0 rows as the record of what was published (hash of the text that said "버전 1.0")', () => {
      expect(v1.map((d) => [d.consentId, d.docHash])).toEqual([
        [
          'TOS',
          '97b15008160a8e381efb66222f27487b316d1925c01e6fe54c114cc1aabd7c58',
        ],
        [
          'PRIVACY',
          'ad74dea6c6372da76c72bdd546b389e66815e4da6af15ed66cde1addfe33cfd6',
        ],
        [
          'AGE14',
          '97b15008160a8e381efb66222f27487b316d1925c01e6fe54c114cc1aabd7c58',
        ],
      ]);
      expect(V1_EFFECTIVE_AT.toISOString()).toBe('2026-10-29T15:00:00.000Z');
    });

    it('serves 0.1 (not 1.0) from the effective date and keeps 1.0 signers in; draft signers agree again', () => {
      const catalog = CONSENT_DOCUMENT_VERSIONS;
      const before = new Date('2026-10-29T23:59:59+09:00');
      const after = new Date('2026-10-30T00:00:00+09:00');
      const later = new Date('2027-06-01T00:00:00+09:00');
      for (const id of ['TOS', 'PRIVACY', 'AGE14'] as const) {
        expect(currentConsentVersion(id, catalog, before).version).toBe(
          '0.1-draft',
        );
        expect(isConsentSatisfied(id, ['0.1-draft'], catalog, before)).toBe(
          true,
        );
        // 0.1(같은 날 게시한 다음 판이 있으면 그 판) — 옛 표기 1.0은 내지 않는다
        expect(currentConsentVersion(id, catalog, after).version).toMatch(
          /^0\.\d+$/,
        );
        expect(isConsentSatisfied(id, ['0.1-draft'], catalog, after)).toBe(
          false,
        );
        for (const now of [after, later]) {
          expect(isConsentSatisfied(id, ['1.0'], catalog, now), id).toBe(
            LEGAL_CONSENT_RELEASES.filter(
              (r) =>
                r.consentId === id &&
                r.version !== '0.1' &&
                new Date(`${r.effectiveDate}T00:00:00+09:00`) <= now,
            ).every((r) => !r.reconsentRequired),
          );
          expect(isConsentSatisfied(id, ['0.1'], catalog, after)).toBe(true);
        }
      }
      // 정식본이 없는 동의는 초안이 그대로 현재 버전이다
      for (const id of [
        'MARKETING',
        'FIN_LINK',
        'FIN_PRIVACY',
        'THIRD_PARTY',
      ] as const) {
        expect(currentConsentVersion(id, catalog, later).version).toBe(
          '0.1-draft',
        );
        expect(isConsentSatisfied(id, ['0.1-draft'], catalog, later)).toBe(
          true,
        );
      }
    });
  });
});
