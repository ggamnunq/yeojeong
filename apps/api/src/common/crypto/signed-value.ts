import { createHmac, hkdfSync, timingSafeEqual } from 'node:crypto';

/**
 * 짧게 쓰는 서명 값(OAuth state 쿠키, 가입 대기 쿠키). 형식: v1.<payload base64url>.<HMAC-SHA256 base64url>
 * payload에 용도(purpose)와 만료 시각을 넣어 다른 쿠키로 바꿔 쓰거나 오래 재사용하지 못하게 한다. 암호화는 하지 않으니 비밀을 넣지 않는다.
 */
export class ValueSigner {
  private readonly key: Buffer;

  constructor(secret: string) {
    this.key = Buffer.from(
      hkdfSync('sha256', secret, '', 'yeojeong:signed-value:v1', 32),
    );
  }

  sign<T>(purpose: string, value: T, ttlSeconds: number, now = Date.now()) {
    const payload = Buffer.from(
      JSON.stringify({
        p: purpose,
        v: value,
        e: Math.floor(now / 1000) + ttlSeconds,
      }),
    ).toString('base64url');
    return `v1.${payload}.${this.mac(payload)}`;
  }

  /** 서명·용도·만료가 모두 맞을 때만 값을 돌려준다 */
  verify<T>(purpose: string, token: unknown, now = Date.now()): T | null {
    if (typeof token !== 'string' || token.length > 4096) return null;
    const [version, payload, mac] = token.split('.');
    if (version !== 'v1' || !payload || !mac) return null;
    const expected = Buffer.from(this.mac(payload));
    const given = Buffer.from(mac);
    if (expected.length !== given.length || !timingSafeEqual(expected, given)) {
      return null;
    }
    try {
      const data = JSON.parse(
        Buffer.from(payload, 'base64url').toString('utf8'),
      ) as { p?: unknown; v?: unknown; e?: unknown };
      if (data.p !== purpose || typeof data.e !== 'number') return null;
      if (data.e * 1000 <= now) return null;
      return data.v as T;
    } catch {
      return null;
    }
  }

  private mac(payload: string) {
    return createHmac('sha256', this.key).update(payload).digest('base64url');
  }
}
