import {
  assertSafelyMasked,
  deriveShortLabel,
  isSafelyMasked,
  last4FromMasked,
  maskAccountNumber,
  maskCardNumber,
  normalizeMerchantKey,
  paymentMethodLabel,
} from './masking.js';

describe('masking (I-9)', () => {
  it('masks card numbers to the last 4 digits only (no BIN)', () => {
    expect(maskCardNumber('5365123456781934')).toBe('**** **** **** 1934');
    expect(maskCardNumber('5365-1234-5678-1934')).toBe('**** **** **** 1934');
    expect(maskCardNumber('5365-1234-5678-1934')).not.toContain('5365');
    expect(() => maskCardNumber('1234')).toThrow(RangeError);
  });

  it('masks account numbers keeping hyphens, first 4 and last 3', () => {
    expect(maskAccountNumber('3333-01-2345821')).toBe('3333-**-****821');
    expect(maskAccountNumber('100012345621')).toBe('1000*****621');
    expect(() => maskAccountNumber('12-34')).toThrow(RangeError);
  });

  it('accepts only the confirmed formats and never a full number or card BIN', () => {
    expect(isSafelyMasked('**** **** **** 1934', 'CARD')).toBe(true);
    expect(isSafelyMasked('5365-****-****-1934', 'CARD')).toBe(false); // 앞자리 금지
    expect(isSafelyMasked('5365123456781934', 'CARD')).toBe(false);
    expect(isSafelyMasked('3333-**-****821', 'ACCOUNT')).toBe(true);
    expect(isSafelyMasked('1000-****-*621', 'ACCOUNT')).toBe(true);
    expect(isSafelyMasked('1000-12**-**21', 'ACCOUNT')).toBe(false); // 앞 6자리 노출
    expect(isSafelyMasked('1000-1234-5621', 'ACCOUNT')).toBe(false);
    expect(isSafelyMasked('10**-**34-5621', 'ACCOUNT')).toBe(false);
    expect(isSafelyMasked('토스뱅크 ****', 'ACCOUNT')).toBe(false);
    expect(() => assertSafelyMasked('5365123456781934', 'CARD')).toThrow(
      '마스킹되지 않았습니다',
    );
  });

  it('takes last4 from the masked tail', () => {
    expect(last4FromMasked('**** **** **** 1934')).toBe('1934');
    expect(last4FromMasked('1000-12**-**21')).toBe('21');
    expect(last4FromMasked('3333-**-****821')).toBe('821');
    expect(() => last4FromMasked('****-****')).toThrow();
  });

  it('derives the short label for the detail line', () => {
    expect(
      deriveShortLabel({
        type: 'CARD',
        institutionName: '토스뱅크',
        productName: '토스뱅크 체크카드',
      }),
    ).toBe('토스뱅크 체크카드');
    expect(
      deriveShortLabel({
        type: 'CARD',
        institutionName: '신한카드',
        productName: '신한카드 Deep Dream',
      }),
    ).toBe('신한카드');
    expect(
      deriveShortLabel({
        type: 'ACCOUNT',
        institutionName: '토스뱅크',
        productName: '토스뱅크 통장',
      }),
    ).toBe('토스뱅크 통장');
    expect(
      paymentMethodLabel({ shortLabel: '토스뱅크 체크카드', last4: '1934' }),
    ).toBe('토스뱅크 체크카드 1934');
  });

  it('normalizes merchant names (NFKC → upper → no spaces or symbols)', () => {
    expect(normalizeMerchantKey('이치란 라멘 도톤보리점')).toBe(
      normalizeMerchantKey('이치란라멘·도톤보리점'),
    );
    expect(normalizeMerchantKey('ｍｋ Taxi!')).toBe('MKTAXI');
  });
});
