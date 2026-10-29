import { generateKeyPairSync, sign } from 'node:crypto';
import { ConfigService } from '@nestjs/config';
import { GoogleOidcVerifier } from './google-oidc-verifier.js';

const AUDIENCE = 'https://api.example.run.app';
const EMAIL = 'scheduler@example.iam.gserviceaccount.com';
const KID = 'test-key';
const { privateKey, publicKey } = generateKeyPairSync('rsa', {
  modulusLength: 2048,
});
const jwk = { ...publicKey.export({ format: 'jwk' }), kid: KID, alg: 'RS256' };

function verifier() {
  return new GoogleOidcVerifier(
    new ConfigService({
      INTERNAL_JOB_OIDC_AUDIENCE: AUDIENCE,
      INTERNAL_JOB_OIDC_SERVICE_ACCOUNT: EMAIL,
    }),
  );
}

function token(overrides: Record<string, unknown> = {}) {
  const now = Math.floor(Date.now() / 1_000);
  const header = encode({ alg: 'RS256', kid: KID, typ: 'JWT' });
  const claims = encode({
    iss: 'https://accounts.google.com',
    aud: AUDIENCE,
    exp: now + 300,
    iat: now,
    email: EMAIL,
    email_verified: true,
    ...overrides,
  });
  const input = `${header}.${claims}`;
  const signature = sign('RSA-SHA256', Buffer.from(input), privateKey).toString(
    'base64url',
  );
  return `${input}.${signature}`;
}

function encode(value: object) {
  return Buffer.from(JSON.stringify(value)).toString('base64url');
}

describe('GoogleOidcVerifier', () => {
  beforeEach(() => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        new Response(JSON.stringify({ keys: [jwk] }), {
          status: 200,
          headers: { 'cache-control': 'public, max-age=300' },
        }),
      ),
    );
  });

  afterEach(() => vi.unstubAllGlobals());

  it('verifies the Google signature, audience and service account email', async () => {
    await expect(verifier().verify(token())).resolves.toBe(true);
  });

  it.each([
    { aud: 'https://wrong.example.com' },
    { email: 'attacker@example.iam.gserviceaccount.com' },
    { email_verified: false },
    { iss: 'https://evil.example.com' },
    { exp: 0 },
  ])('rejects invalid claims %o', async (claims) => {
    await expect(verifier().verify(token(claims))).resolves.toBe(false);
  });

  it('rejects a token whose signed payload was changed', async () => {
    const [header, , signature] = token().split('.');
    const changed = `${header}.${encode({ aud: AUDIENCE })}.${signature}`;
    await expect(verifier().verify(changed)).resolves.toBe(false);
  });

  it('fails closed when OIDC is not configured', async () => {
    const instance = new GoogleOidcVerifier(new ConfigService({}));
    await expect(instance.verify(token())).resolves.toBe(false);
    expect(fetch).not.toHaveBeenCalled();
  });
});
