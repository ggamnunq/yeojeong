import { ConfigService } from '@nestjs/config';
import { AppException } from '../common/errors/index.js';
import { TwoWayTokenSealer, type TwoWayState } from './two-way-token.js';

const sealer = new TwoWayTokenSealer(
  new ConfigService({
    TOKEN_ENCRYPTION_KEY: Buffer.alloc(32, 7).toString('base64'),
  }),
);
const state: TwoWayState = {
  organization: '0311',
  from: '2026-11-01',
  to: '2026-11-13',
  loginRef: 'a'.repeat(64),
  nonce: 'nonce-value',
  info: {
    jobIndex: 0,
    threadIndex: 1,
    jti: 'jti-value',
    twoWayTimestamp: 1793260000000,
  },
};
const code = (fn: () => unknown) => {
  try {
    fn();
  } catch (error) {
    return (error as AppException).code;
  }
  return null;
};

describe('TwoWayTokenSealer', () => {
  const now = Date.parse('2026-11-13T05:00:00Z');
  const token = sealer.seal('user-1', state, new Date(now + 160_000));

  it('round-trips for the same user before expiry and hides the content', () => {
    expect(token.startsWith('tw1.')).toBe(true);
    expect(token).not.toContain('jti-value');
    expect(
      Buffer.from(token.slice(4), 'base64url').toString('latin1'),
    ).not.toContain('0311');
    expect(sealer.open('user-1', token, now)).toEqual(state);
  });

  it('rejects another user, expiry, tampering and a different key with 410', () => {
    expect(code(() => sealer.open('user-2', token, now))).toBe(
      'CARD_TWO_WAY_EXPIRED',
    );
    expect(code(() => sealer.open('user-1', token, now + 160_000))).toBe(
      'CARD_TWO_WAY_EXPIRED',
    );
    // 끝자리 base64url 문자는 남는 비트만 바뀌어 디코드 결과가 같을 수 있다. 바이트를 직접 뒤집는다
    const raw = Buffer.from(token.slice(4), 'base64url');
    raw[raw.length - 1] ^= 0xff;
    const tampered = `tw1.${raw.toString('base64url')}`;
    expect(code(() => sealer.open('user-1', tampered, now))).toBe(
      'CARD_TWO_WAY_EXPIRED',
    );
    expect(code(() => sealer.open('user-1', 'nope', now))).toBe(
      'CARD_TWO_WAY_EXPIRED',
    );
    const other = new TwoWayTokenSealer(
      new ConfigService({
        TOKEN_ENCRYPTION_KEY: Buffer.alloc(32, 8).toString('base64'),
      }),
    );
    expect(code(() => other.open('user-1', token, now))).toBe(
      'CARD_TWO_WAY_EXPIRED',
    );
  });
});
