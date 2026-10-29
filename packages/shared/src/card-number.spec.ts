import { describe, expect, it } from 'vitest';
import {
  isValidCardNumber,
  isValidCardPassword,
  luhnValid,
  normalizeCardNumber,
} from './index.js';

describe('card number rules (S8c)', () => {
  it('checks Luhn', () => {
    expect(luhnValid('4111111111111111')).toBe(true);
    expect(luhnValid('4111111111111112')).toBe(false);
    expect(luhnValid('79927398713')).toBe(true);
  });

  it('accepts digits only, 14~19 long, with a valid check digit', () => {
    expect(isValidCardNumber('4111111111111111')).toBe(true);
    // 15자리 AMEX 테스트 번호, 14자리 Diners 테스트 번호, 19자리
    expect(isValidCardNumber('378282246310005')).toBe(true);
    expect(isValidCardNumber('30569309025904')).toBe(true);
    expect(isValidCardNumber('4111111111111111110')).toBe(true);
    expect(isValidCardNumber('4111111111111112')).toBe(false);
    expect(isValidCardNumber('4111-1111-1111-1111')).toBe(false);
    expect(isValidCardNumber('4111 1111 1111 1111')).toBe(false);
    expect(isValidCardNumber('4242424242426')).toBe(false); // 13자리
    expect(isValidCardNumber('41111111111111111111')).toBe(false); // 20자리
    expect(isValidCardNumber('')).toBe(false);
    expect(isValidCardNumber('４１１１１１１１１１１１１１１１')).toBe(false); // 전각 숫자
  });

  it('skips Luhn only for UnionPay (62) numbers', () => {
    expect(isValidCardNumber('6253123456780000')).toBe(true);
    expect(isValidCardNumber('6253-1234')).toBe(false);
  });

  it('normalizes spaces and hyphens away', () => {
    expect(normalizeCardNumber(' 4111-1111 1111-1111 ')).toBe(
      '4111111111111111',
    );
    expect(normalizeCardNumber('4111.1111.1111.1111')).toBeNull();
    expect(normalizeCardNumber('4111111111111112')).toBeNull();
  });

  it('checks card password digits per issuer', () => {
    expect(isValidCardPassword('12', 2)).toBe(true);
    expect(isValidCardPassword('1234', 4)).toBe(true);
    expect(isValidCardPassword('123', 2)).toBe(false);
    expect(isValidCardPassword('12a4', 4)).toBe(false);
    expect(isValidCardPassword('', 2)).toBe(false);
  });
});
