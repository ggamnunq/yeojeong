import { CONSENT_ID_VALUES } from '@yeojeong/shared';
import {
  CONSENT_DOCUMENT_VERSIONS,
  currentConsentVersion,
  isConsentSatisfied,
  type ConsentDocumentVersion,
} from './consent-catalog.js';

const doc = (
  version: string,
  effectiveAt: string,
  changeType: 'MAJOR' | 'MINOR',
): ConsentDocumentVersion => ({
  consentId: 'TOS',
  version,
  effectiveAt: new Date(`${effectiveAt}T00:00:00+09:00`),
  changeType,
  docPath: 'docs/legal/서비스 이용약관.md',
  docHash: '0'.repeat(64),
  summary: null,
  draft: false,
});

describe('consent catalog', () => {
  it('has a current version with a SHA-256 hash for every consent ID', () => {
    for (const id of CONSENT_ID_VALUES) {
      expect(currentConsentVersion(id).docHash).toMatch(/^[0-9a-f]{64}$/);
    }
    const keys = CONSENT_DOCUMENT_VERSIONS.map(
      (v) => `${v.consentId}@${v.version}`,
    );
    expect(new Set(keys).size).toBe(keys.length);
  });

  const catalog = [
    doc('2026-12-01', '2026-12-01', 'MAJOR'),
    doc('2027-02-01', '2027-02-01', 'MINOR'),
    doc('2027-06-01', '2027-06-01', 'MAJOR'),
  ];

  it('picks the latest effective version as current', () => {
    const at = (date: string) => new Date(`${date}T12:00:00+09:00`);
    expect(
      currentConsentVersion('TOS', at('2027-03-01'), catalog).version,
    ).toBe('2027-02-01');
    expect(
      currentConsentVersion('TOS', at('2027-06-01'), catalog).version,
    ).toBe('2027-06-01');
  });

  it('keeps consents across MINOR changes and requires them again after MAJOR', () => {
    const march = new Date('2027-03-01T00:00:00+09:00');
    const july = new Date('2027-07-01T00:00:00+09:00');
    expect(isConsentSatisfied('TOS', ['2026-12-01'], march, catalog)).toBe(
      true,
    );
    expect(isConsentSatisfied('TOS', ['2026-12-01'], july, catalog)).toBe(
      false,
    );
    expect(isConsentSatisfied('TOS', ['2027-02-01'], july, catalog)).toBe(
      false,
    );
    expect(isConsentSatisfied('TOS', ['2027-06-01'], july, catalog)).toBe(true);
    expect(isConsentSatisfied('TOS', [], march, catalog)).toBe(false);
    expect(isConsentSatisfied('TOS', ['0.1-draft'], march, catalog)).toBe(
      false,
    );
  });
});
