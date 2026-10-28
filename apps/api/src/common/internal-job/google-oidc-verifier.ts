import { createPublicKey, verify } from 'node:crypto';
import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

const GOOGLE_JWKS_URL = 'https://www.googleapis.com/oauth2/v3/certs';
const GOOGLE_ISSUERS = new Set([
  'accounts.google.com',
  'https://accounts.google.com',
]);
const CLOCK_TOLERANCE_SECONDS = 30;
const DEFAULT_CACHE_SECONDS = 300;

interface JwtHeader {
  alg?: unknown;
  kid?: unknown;
  typ?: unknown;
}

interface GoogleClaims {
  iss?: unknown;
  aud?: unknown;
  exp?: unknown;
  iat?: unknown;
  nbf?: unknown;
  email?: unknown;
  email_verified?: unknown;
}

interface GoogleJwk extends JsonWebKey {
  kid?: string;
  alg?: string;
  use?: string;
}

interface JwksResponse {
  keys?: GoogleJwk[];
}

/** Google ID token을 앱 내부에서 JWKS로 검증한다. */
@Injectable()
export class GoogleOidcVerifier {
  private keys = new Map<string, GoogleJwk>();
  private keysExpireAt = 0;
  private readonly audience: string;
  private readonly serviceAccountEmail: string;

  constructor(private readonly config: ConfigService) {
    this.audience = config.get<string>('INTERNAL_JOB_OIDC_AUDIENCE') ?? '';
    this.serviceAccountEmail =
      config.get<string>('INTERNAL_JOB_OIDC_SERVICE_ACCOUNT') ?? '';
  }

  get configured(): boolean {
    return this.audience.length > 0 && this.serviceAccountEmail.length > 0;
  }

  async verify(token: string): Promise<boolean> {
    if (!this.configured) return false;

    const parts = token.split('.');
    if (parts.length !== 3) return false;
    const [encodedHeader, encodedClaims, encodedSignature] = parts;
    if (!encodedHeader || !encodedClaims || !encodedSignature) return false;

    const header = decodeJson<JwtHeader>(encodedHeader);
    const claims = decodeJson<GoogleClaims>(encodedClaims);
    if (!header || !claims || header.alg !== 'RS256') return false;
    if (typeof header.kid !== 'string' || header.kid.length === 0) return false;
    if (!validClaims(claims, this.audience, this.serviceAccountEmail)) {
      return false;
    }

    let key = await this.key(header.kid, false);
    if (!key) key = await this.key(header.kid, true);
    if (!key || (key.alg && key.alg !== 'RS256')) return false;

    try {
      return verify(
        'RSA-SHA256',
        Buffer.from(`${encodedHeader}.${encodedClaims}`),
        createPublicKey({ key, format: 'jwk' }),
        Buffer.from(encodedSignature, 'base64url'),
      );
    } catch {
      return false;
    }
  }

  private async key(kid: string, forceRefresh: boolean) {
    if (forceRefresh || Date.now() >= this.keysExpireAt) {
      await this.refreshKeys();
    }
    return this.keys.get(kid);
  }

  private async refreshKeys() {
    const response = await fetch(GOOGLE_JWKS_URL, {
      signal: AbortSignal.timeout(5_000),
    });
    if (!response.ok) throw new Error(`Google JWKS HTTP ${response.status}`);
    const body = (await response.json()) as JwksResponse;
    if (!Array.isArray(body.keys))
      throw new Error('Google JWKS 형식이 잘못됐습니다');

    this.keys = new Map(
      body.keys
        .filter(
          (key): key is GoogleJwk & { kid: string } =>
            typeof key.kid === 'string' &&
            key.kty === 'RSA' &&
            (!key.use || key.use === 'sig'),
        )
        .map((key) => [key.kid, key]),
    );
    const maxAge = parseMaxAge(response.headers.get('cache-control'));
    this.keysExpireAt = Date.now() + maxAge * 1_000;
  }
}

function decodeJson<T>(encoded: string): T | null {
  try {
    return JSON.parse(Buffer.from(encoded, 'base64url').toString('utf8')) as T;
  } catch {
    return null;
  }
}

function validClaims(
  claims: GoogleClaims,
  audience: string,
  serviceAccountEmail: string,
): boolean {
  const now = Math.floor(Date.now() / 1_000);
  const audiences = Array.isArray(claims.aud) ? claims.aud : [claims.aud];
  return (
    typeof claims.iss === 'string' &&
    GOOGLE_ISSUERS.has(claims.iss) &&
    audiences.includes(audience) &&
    typeof claims.exp === 'number' &&
    claims.exp >= now - CLOCK_TOLERANCE_SECONDS &&
    typeof claims.iat === 'number' &&
    claims.iat <= now + CLOCK_TOLERANCE_SECONDS &&
    (claims.nbf === undefined ||
      (typeof claims.nbf === 'number' &&
        claims.nbf <= now + CLOCK_TOLERANCE_SECONDS)) &&
    claims.email === serviceAccountEmail &&
    (claims.email_verified === true || claims.email_verified === 'true')
  );
}

function parseMaxAge(cacheControl: string | null): number {
  const value = cacheControl?.match(/(?:^|,)\s*max-age=(\d+)/i)?.[1];
  return value ? Number(value) : DEFAULT_CACHE_SECONDS;
}
