import type { ExecutionContext } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Reflector } from '@nestjs/core';
import { AppException } from '../errors/index.js';
import type { GoogleOidcVerifier } from './google-oidc-verifier.js';
import { INTERNAL_JOB_SECRET_HEADER, InternalJobGuard } from './index.js';

const SECRET = 's'.repeat(40);

function context(headers: Record<string, string>): ExecutionContext {
  return {
    getHandler: () => () => undefined,
    getClass: () => class {},
    switchToHttp: () => ({ getRequest: () => ({ headers }) }),
  } as unknown as ExecutionContext;
}

function guard(
  env: Record<string, string>,
  options: { internal?: boolean; oidc?: boolean } = {},
) {
  const reflector = {
    getAllAndOverride: vi.fn().mockReturnValue(options.internal ?? true),
  } as unknown as Reflector;
  const oidc = {
    verify: vi.fn().mockResolvedValue(options.oidc ?? false),
  } as unknown as GoogleOidcVerifier;
  return new InternalJobGuard(reflector, new ConfigService(env), oidc);
}

describe('InternalJobGuard', () => {
  it('accepts a verified bearer token', async () => {
    await expect(
      guard({ NODE_ENV: 'production' }, { oidc: true }).canActivate(
        context({ authorization: 'Bearer signed-token' }),
      ),
    ).resolves.toBe(true);
  });

  it('allows the secret only outside production', async () => {
    const headers = { [INTERNAL_JOB_SECRET_HEADER]: SECRET };
    await expect(
      guard({ INTERNAL_JOB_SECRET: SECRET }).canActivate(context(headers)),
    ).resolves.toBe(true);
    await expect(
      guard({
        NODE_ENV: 'production',
        INTERNAL_JOB_SECRET: SECRET,
      }).canActivate(context(headers)),
    ).rejects.toBeInstanceOf(AppException);
  });

  it('fails closed for missing and invalid credentials', async () => {
    await expect(guard({}).canActivate(context({}))).rejects.toMatchObject({
      code: 'FORBIDDEN',
    });
    await expect(
      guard({ INTERNAL_JOB_SECRET: SECRET }).canActivate(
        context({ [INTERNAL_JOB_SECRET_HEADER]: `${SECRET}x` }),
      ),
    ).rejects.toMatchObject({ code: 'FORBIDDEN' });
  });

  it('does not affect routes without @InternalJob()', async () => {
    await expect(
      guard({}, { internal: false }).canActivate(context({})),
    ).resolves.toBe(true);
  });
});
