import { ConfigService } from '@nestjs/config';
import { AppException } from '../common/errors/app-exception.js';
import {
  maskClientErrorMessage,
  maskStackFrame,
  normalizeClientUserAgent,
} from './client-error-mask.js';
import { FixedWindowLimiter } from './client-error-rate-limiter.js';
import type { ClientErrorReportDto } from './client-error.dto.js';
import {
  CLIENT_ERROR_INSTANCE_LIMIT_PER_MIN,
  CLIENT_ERROR_USER_LIMIT_PER_MIN,
  CLIENT_ERROR_USER_REF_FROM,
  ClientErrorsService,
} from './client-errors.service.js';

const report = (
  overrides: Partial<ClientErrorReportDto> = {},
): ClientErrorReportDto => ({
  buildId: 'ccd404d9a1b2',
  route: '/trips/new',
  source: 'boundary',
  name: 'TypeError',
  message: "Cannot read properties of undefined (reading 'members')",
  stack: ['NewTripPage-B3x9aQ.js:1:2345'],
  userAgent: 'Safari 18 / iOS',
  chunk: false,
  staleBuild: true,
  ...overrides,
});

describe('maskClientErrorMessage', () => {
  it.each([
    ['card 4111 1111 1111 1111 rejected', 'card [CARD] rejected'],
    ['pan=4111111111111111', 'pan=[CARD]'],
    ['user traveler@example.com', 'user [EMAIL]'],
    ['trip 3f2b1c4d-5e6f-4a7b-8c9d-0e1f2a3b4c5d', 'trip [ID]'],
    ['amount 125000, phone 01012345678', 'amount [NUM], phone [NUM]'],
    ['invite K7M2QX', 'invite [CODE]'],
    ['/join#code=K7M2QX', '/join#code=[REDACTED]'],
    [
      'Failed to fetch dynamically imported module: https://jinyeojeong.com/assets/A-1.js?x=1#code=Z',
      'Failed to fetch dynamically imported module: …/A-1.js',
    ],
    [
      'Unexpected token, "secret json" is not valid',
      'Unexpected token, "[STR]" is not valid',
    ],
    ['line1\nline2\u2028\u0000end', 'line1 line2 end'],
  ])('%s', (input, expected) => {
    expect(maskClientErrorMessage(input)).toBe(expected);
  });

  it('폭 없는 문자·방향 제어 문자·BOM을 지운다', () => {
    const hidden = [0x200b, 0x200f, 0x202a, 0x202e, 0x2066, 0x2069, 0xfeff]
      .map((code) => String.fromCharCode(code))
      .join('');
    expect(maskClientErrorMessage(`a${hidden}b`)).toBe('a b');
  });

  it('500자로 자른다', () => {
    expect(maskClientErrorMessage('word '.repeat(300))).toHaveLength(500);
  });
});

describe('maskStackFrame', () => {
  it.each([
    ['NewTripPage-B3x9aQ.js:1:23456', 'NewTripPage-B3x9aQ.js:1:23456'],
    ['traveler@example.com:1:2', '[EMAIL]:1:2'],
    ['chunk-01012345678.js:10:5', 'chunk-[NUM].js:10:5'],
    ['(external)', '(external)'],
  ])('%s → %s', (input, expected) => {
    expect(maskStackFrame(input)).toBe(expected);
  });
});

describe('normalizeClientUserAgent', () => {
  it.each([
    ['Safari 18 / iOS', 'Safari 18 / iOS'],
    ['Safari 18 / iOS 18', 'Safari 18 / iOS'],
    ['Chrome 141 WebView / Android 14', 'Chrome 141 WebView / Android'],
    ['KakaoTalk / iOS 17', 'KakaoTalk / iOS'],
    ['Samsung 27 / Android', 'Samsung 27 / Android'],
    ['Chrome ? / macOS', 'Chrome ? / macOS'],
    // 세부 버전·기기 모델·빌드 문자열·모르는 이름은 버린다
    ['Chrome 141.0.7390.122 / Android 15', 'other / Android'],
    ['Chrome 141 / Android 15 SM-S928N', 'Chrome 141 / Android'],
    ['SM-S928N Build/AP3A', 'other / other'],
    ['Safari 18 WebView / iOS', 'Safari 18 / iOS'],
    ['Evil 12345 / FreeBSD', 'other / other'],
    ['', 'other / other'],
  ])('%s → %s', (input, expected) => {
    expect(normalizeClientUserAgent(input)).toBe(expected);
  });
});

describe('FixedWindowLimiter', () => {
  it('창 안에서 한도까지만, 창이 지나면 다시', () => {
    const limiter = new FixedWindowLimiter(2, 1000);
    expect([0, 1, 2].map(() => limiter.take('a', 0))).toEqual([
      true,
      true,
      false,
    ]);
    expect(limiter.take('b', 0)).toBe(true);
    expect(limiter.take('a', 1000)).toBe(true);
  });

  it('키가 상한을 넘으면 만료된 것부터 지우고, 그래도 많으면 비운다', () => {
    const limiter = new FixedWindowLimiter(1, 1000, 3);
    limiter.take('a', 0);
    limiter.take('b', 0);
    limiter.take('c', 0);
    limiter.take('d', 2000); // a·b·c 만료 → 지운다
    expect(limiter.size).toBe(1);
    limiter.take('e', 2000);
    limiter.take('f', 2000);
    limiter.take('g', 2000); // 만료된 것이 없어 비운다
    expect(limiter.size).toBe(1);
  });
});

describe('ClientErrorsService', () => {
  const create = (env: Record<string, string> = {}) =>
    new ClientErrorsService(new ConfigService(env));
  const KEY = 'k'.repeat(40);

  it('구조화 로그(warn, event=client_error) 한 줄. 메시지는 다시 가리고 userId 대신 userRef(처리방침 0.3 시행 뒤)', () => {
    const service = create({ USER_REF_HMAC_KEY: KEY });
    const spy = vi
      .spyOn(
        (service as unknown as { logger: { warn: () => void } }).logger,
        'warn',
      )
      .mockImplementation(() => {});
    const userId = '3f2b1c4d-5e6f-4a7b-8c9d-0e1f2a3b4c5d';

    expect(
      service.record(report({ message: 'bad card 4111111111111111' }), {
        userId,
        now: CLIENT_ERROR_USER_REF_FROM,
      }),
    ).toBe('logged');

    expect(spy).toHaveBeenCalledWith(
      {
        event: 'client_error',
        buildId: 'ccd404d9a1b2',
        route: '/trips/new',
        source: 'boundary',
        errorName: 'TypeError',
        errorMessage: 'bad card [CARD]',
        stack: ['NewTripPage-B3x9aQ.js:1:2345'],
        clientUserAgent: 'Safari 18 / iOS',
        chunk: false,
        staleBuild: true,
        loggedIn: true,
        userRef: service.userRef(userId),
      },
      'client_error TypeError /trips/new',
    );
    expect(JSON.stringify(spy.mock.calls)).not.toContain(userId);
  });

  it('에러 이름·스택 파일 이름도 다시 가린다(줄·열 번호는 그대로)', () => {
    const service = create();
    const spy = vi
      .spyOn(
        (service as unknown as { logger: { warn: () => void } }).logger,
        'warn',
      )
      .mockImplementation(() => {});
    service.record(
      report({
        name: 'Err01012345678',
        stack: ['user@example.com:1:23456', 'a-4111111111111111.js:2:3'],
      }),
    );
    expect(spy).toHaveBeenCalledWith(
      expect.objectContaining({
        errorName: 'Err[NUM]',
        stack: ['[EMAIL]:1:23456', 'a-[CARD].js:2:3'],
      }),
      'client_error Err[NUM] /trips/new',
    );
  });

  it('route에 실제 ID·숫자가 실려 와도 가린다', () => {
    const service = create();
    const spy = vi
      .spyOn(
        (service as unknown as { logger: { warn: () => void } }).logger,
        'warn',
      )
      .mockImplementation(() => {});
    service.record(
      report({
        route: '/trips/3f2b1c4d-5e6f-4a7b-8c9d-0e1f2a3b4c5d/import/0306',
      }),
    );
    expect(spy).toHaveBeenCalledWith(
      expect.objectContaining({ route: '/trips/[ID]/import/[NUM]' }),
      'client_error TypeError /trips/[ID]/import/[NUM]',
    );
  });

  it('처리방침 0.3 시행(2026-11-07 00:00 KST) 전에는 userRef 없이 loggedIn만', () => {
    expect(new Date(CLIENT_ERROR_USER_REF_FROM).toISOString()).toBe(
      '2026-11-06T15:00:00.000Z',
    );
    const service = create({ USER_REF_HMAC_KEY: KEY });
    const spy = vi
      .spyOn(
        (service as unknown as { logger: { warn: () => void } }).logger,
        'warn',
      )
      .mockImplementation(() => {});
    service.record(report(), {
      userId: 'u1',
      now: CLIENT_ERROR_USER_REF_FROM - 1,
    });
    service.record(report(), { now: CLIENT_ERROR_USER_REF_FROM - 1 });
    service.record(report(), { now: CLIENT_ERROR_USER_REF_FROM });
    expect(
      (spy.mock.calls as unknown as [unknown][]).map(([fields]) => fields),
    ).toEqual([
      expect.objectContaining({ loggedIn: true, userRef: null }),
      expect.objectContaining({ loggedIn: false, userRef: null }),
      expect.objectContaining({ loggedIn: false, userRef: null }),
    ]);
  });

  it('userRef: 16자 hex, 같은 사용자는 같고 키가 다르면 다르다. 동의 기록 userRefHash(HMAC(userId))와 다르다', async () => {
    const { createHmac } = await import('node:crypto');
    const a = create({ USER_REF_HMAC_KEY: KEY });
    const b = create({ USER_REF_HMAC_KEY: 'z'.repeat(40) });
    const ref = a.userRef('user-1');
    expect(ref).toMatch(/^[0-9a-f]{16}$/);
    expect(a.userRef('user-1')).toBe(ref);
    expect(a.userRef('user-2')).not.toBe(ref);
    expect(b.userRef('user-1')).not.toBe(ref);
    const consentRef = createHmac('sha256', KEY).update('user-1').digest('hex');
    expect(consentRef.startsWith(ref)).toBe(false);
    // 키가 없는 로컬도 값은 만든다
    expect(create().userRef('user-1')).toMatch(/^[0-9a-f]{16}$/);
  });

  it('사용자당 1분 한도를 넘으면 429 RATE_LIMITED', () => {
    const service = create({ USER_REF_HMAC_KEY: KEY });
    vi.spyOn(
      (service as unknown as { logger: { warn: () => void } }).logger,
      'warn',
    ).mockImplementation(() => {});
    for (let i = 0; i < CLIENT_ERROR_USER_LIMIT_PER_MIN; i++) {
      service.record(report(), { userId: 'u1', now: 0 });
    }
    expect(() => service.record(report(), { userId: 'u1', now: 0 })).toThrow(
      AppException,
    );
    // 다른 사용자·비로그인은 영향 없음, 1분 뒤 풀린다
    expect(service.record(report(), { userId: 'u2', now: 0 })).toBe('logged');
    expect(service.record(report(), { now: 0 })).toBe('logged');
    expect(service.record(report(), { userId: 'u1', now: 60_000 })).toBe(
      'logged',
    );
  });

  it('인스턴스 1분 상한을 넘으면 남기지 않고 버린다', () => {
    const service = create();
    const spy = vi
      .spyOn(
        (service as unknown as { logger: { warn: () => void } }).logger,
        'warn',
      )
      .mockImplementation(() => {});
    for (let i = 0; i < CLIENT_ERROR_INSTANCE_LIMIT_PER_MIN; i++) {
      service.record(report(), { now: 0 });
    }
    expect(service.record(report(), { now: 0 })).toBe('dropped');
    expect(spy).toHaveBeenCalledTimes(CLIENT_ERROR_INSTANCE_LIMIT_PER_MIN);
  });
});
