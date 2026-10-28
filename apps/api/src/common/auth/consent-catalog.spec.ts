import {
  currentConsentVersion,
  isConsentSatisfied,
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

  it('fails loudly when no document is in effect', () => {
    expect(() => currentConsentVersion('TOS', [], at('2026-11-01'))).toThrow();
  });
});
