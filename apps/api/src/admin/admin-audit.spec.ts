import { clientIp } from './admin-audit.js';

describe('clientIp (admin access log 접속지 정보)', () => {
  it('keeps IPv4 and IPv6 as they are, unwraps IPv4-mapped IPv6', () => {
    expect(clientIp('203.0.113.7')).toBe('203.0.113.7');
    expect(clientIp('2001:db8::1')).toBe('2001:db8::1');
    expect(clientIp('::ffff:198.51.100.2')).toBe('198.51.100.2');
  });

  it('returns null for a missing or malformed address', () => {
    expect(clientIp(undefined)).toBeNull();
    expect(clientIp('')).toBeNull();
    expect(clientIp('not-an-ip')).toBeNull();
    expect(clientIp('1.2.3.4, 5.6.7.8')).toBeNull();
  });
});
