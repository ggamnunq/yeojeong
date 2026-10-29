import type { ConfigService } from '@nestjs/config';
import { NotFoundError } from './errors/app-exception.js';
import { AccountLinkGuard, FeatureFlags, parseBooleanEnv } from './features.js';

// ConfigService는 process.env(테스트 env는 플래그를 켠다)를 먼저 읽으므로 값만 돌려주는 가짜를 쓴다
const flagsWith = (value: string | undefined) =>
  new FeatureFlags({ get: () => value } as unknown as ConfigService);

describe('기능 플래그(FR-006)', () => {
  it('defaults accountLink to false and accepts only true/false', () => {
    expect(flagsWith(undefined).view()).toEqual({ accountLink: false });
    expect(flagsWith('').accountLink).toBe(false);
    expect(flagsWith('TRUE').accountLink).toBe(true);
    expect(flagsWith(' false ').accountLink).toBe(false);
    expect(() => parseBooleanEnv('FEATURE_ACCOUNT_LINK', 'yes', false)).toThrow(
      /true 또는 false/,
    );
  });

  it('hides account-link routes with 404 while off', () => {
    const ctx = {} as never;
    expect(() =>
      new AccountLinkGuard(flagsWith('false')).canActivate(ctx),
    ).toThrow(NotFoundError);
    expect(new AccountLinkGuard(flagsWith('true')).canActivate(ctx)).toBe(true);
  });
});
