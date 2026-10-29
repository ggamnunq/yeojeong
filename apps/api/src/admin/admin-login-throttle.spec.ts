import { rateLimitAddress } from './admin-login-throttle.js';

describe('rateLimitAddress', () => {
  it('keeps IPv4, unwraps IPv4-mapped IPv6 and truncates IPv6 to /64', () => {
    expect(rateLimitAddress('203.0.113.7')).toBe('203.0.113.7');
    expect(rateLimitAddress('::ffff:203.0.113.7')).toBe('203.0.113.7');
    expect(rateLimitAddress('::ffff:cb00:7107')).toBe('203.0.113.7');
    expect(rateLimitAddress('2001:db8:1:2:3:4:5:6')).toBe('2001:db8:1:2::');
    expect(rateLimitAddress('2001:db8:1:2:ffff:ffff:ffff:ffff')).toBe(
      '2001:db8:1:2::',
    );
    expect(rateLimitAddress('2001:DB8::1')).toBe('2001:db8:0:0::');
    expect(rateLimitAddress('fe80::1%eth0')).toBe('fe80:0:0:0::');
    expect(rateLimitAddress('::1')).toBe('0:0:0:0::');
    expect(rateLimitAddress('64:ff9b::198.51.100.1')).toBe('64:ff9b:0:0::');
  });

  it('returns null for non-IP values', () => {
    for (const value of [
      undefined,
      null,
      '',
      'localhost',
      '1.2.3',
      '2001:db8::1::2',
    ]) {
      expect(rateLimitAddress(value)).toBeNull();
    }
  });
});
