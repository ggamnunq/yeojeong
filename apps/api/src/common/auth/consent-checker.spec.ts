import {
  validConsentVersions,
  type ConsentHistoryRow,
} from './consent-checker.js';

const at = (minute: number) => new Date(Date.UTC(2026, 9, 29, 3, minute));

const row = (
  overrides: Partial<ConsentHistoryRow> & { minute: number },
): ConsentHistoryRow => ({
  consentId: 'FIN_LINK',
  version: '0.1-draft',
  agreed: true,
  agreedAt: at(overrides.minute),
  withdrawnAt: null,
  createdAt: at(overrides.minute),
  ...overrides,
});

describe('validConsentVersions (기능명세 4-10 v0.5.7: 버전별 가장 최근 행으로 판정)', () => {
  it('a withdrawn grant is not valid', () => {
    expect(
      validConsentVersions(
        [row({ minute: 0, withdrawnAt: at(5) })],
        'FIN_LINK',
      ),
    ).toEqual([]);
  });

  it('re-agreeing after a withdrawal appends a new row that becomes valid; the withdrawn row stays as history', () => {
    const rows = [row({ minute: 0, withdrawnAt: at(5) }), row({ minute: 10 })];
    expect(validConsentVersions(rows, 'FIN_LINK')).toEqual(['0.1-draft']);
  });

  it('the latest row wins even when an older row of the same version is still active', () => {
    // 예: 선택 항목을 나중에 거부(agreed=false)로 다시 기록
    const rows = [row({ minute: 0 }), row({ minute: 10, agreed: false })];
    expect(validConsentVersions(rows, 'FIN_LINK')).toEqual([]);
  });

  it('breaks agreedAt ties with createdAt and ignores other consent IDs', () => {
    const rows = [
      row({ minute: 0, withdrawnAt: at(1), createdAt: at(2) }),
      row({ minute: 0, createdAt: at(1) }),
      row({ minute: 20, consentId: 'THIRD_PARTY' }),
    ];
    expect(validConsentVersions(rows, 'FIN_LINK')).toEqual([]);
    expect(validConsentVersions(rows, 'THIRD_PARTY')).toEqual(['0.1-draft']);
  });

  it('judges each version separately', () => {
    const rows = [
      row({ minute: 0, version: '0.1-draft' }),
      row({ minute: 10, version: '2026-12-01', withdrawnAt: at(11) }),
    ];
    expect(validConsentVersions(rows, 'FIN_LINK')).toEqual(['0.1-draft']);
  });
});
