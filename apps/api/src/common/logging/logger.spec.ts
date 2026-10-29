import { ConfigService } from '@nestjs/config';
import { createLogger } from './logger.js';

describe('createLogger', () => {
  it('writes Cloud Logging JSON in production and redacts credentials', () => {
    let output = '';
    const logger = createLogger(
      new ConfigService({ NODE_ENV: 'production', LOG_LEVEL: 'info' }),
      { write: (line: string) => (output += line) },
    );

    logger.warn(
      { headers: { authorization: 'Bearer secret', cookie: 'session=secret' } },
      '헤더를 통째로 남긴 실수',
    );

    const line = JSON.parse(output) as Record<string, unknown>;
    expect(line).toMatchObject({
      severity: 'WARNING',
      message: '헤더를 통째로 남긴 실수',
      headers: { authorization: '[REDACTED]', cookie: '[REDACTED]' },
    });
    expect(line).not.toHaveProperty('level');
    expect(output).not.toContain('secret');
  });

  it('redacts card-import credentials even when a body, DTO or error is logged by mistake (S8)', () => {
    let output = '';
    const logger = createLogger(
      new ConfigService({ NODE_ENV: 'production', LOG_LEVEL: 'info' }),
      { write: (line: string) => (output += line) },
    );
    const leakyError = Object.assign(new Error('CODEF 호출 실패'), {
      request: {
        loginId: 'leak-login-id',
        encryptedPassword: 'leak-cipher',
        connectedId: 'leak-connected-id',
      },
    });

    logger.error({ body: { loginId: 'leak-login-id' } }, '본문째 남긴 실수');
    logger.error(
      {
        dto: {
          organization: '0306',
          loginId: 'leak-login-id',
          encryptedPassword: 'leak-cipher',
          twoWay: { token: 'leak-two-way', code: '123456' },
        },
      },
      'DTO째 남긴 실수',
    );
    logger.error({ err: leakyError }, '에러 객체에 요청이 붙은 실수');
    logger.error(
      { codef: { data: { twoWayInfo: { jti: 'leak-jti' }, password: 'pw' } } },
      'CODEF 응답째 남긴 실수',
    );

    expect(output).not.toMatch(/leak-|"pw"|123456/);
    const lines = output
      .trim()
      .split('\n')
      .map((l) => JSON.parse(l) as Record<string, unknown>);
    expect(lines[0]).toMatchObject({ body: '[REDACTED]' });
    expect(lines[1]).toMatchObject({
      dto: {
        organization: '0306',
        loginId: '[REDACTED]',
        encryptedPassword: '[REDACTED]',
        twoWay: '[REDACTED]',
      },
    });
    expect(lines[2]).toMatchObject({
      err: { message: 'CODEF 호출 실패', request: { loginId: '[REDACTED]' } },
    });
  });

  it('masks card numbers and card passwords under every key spelling (S8c 현대·하나)', () => {
    let output = '';
    const logger = createLogger(
      new ConfigService({ NODE_ENV: 'production', LOG_LEVEL: 'info' }),
      { write: (line: string) => (output += line) },
    );
    const PAN = '4111111111111111';
    logger.error(
      {
        dto: {
          organization: '0302',
          loginCardNo: PAN,
          encryptedCardPassword: 'leak-card-cipher',
        },
      },
      '요청 DTO',
    );
    logger.error(
      {
        codefRequest: {
          loginCardNo: PAN,
          cardPassword: 'leak-card-pw',
          cardNo: PAN,
        },
      },
      'CODEF 본문',
    );
    logger.error(
      { form: { cardNumber: PAN, card_number: PAN, 'Login-Card-No': PAN } },
      '화면 이름',
    );
    const cause = Object.assign(new Error('inner'), { loginCardNo: PAN });
    logger.error({ err: new Error('outer', { cause }) }, '에러 원인');

    expect(output).not.toContain(PAN);
    expect(output).not.toContain('leak-');
    const lines = output
      .trim()
      .split('\n')
      .map((l) => JSON.parse(l) as Record<string, unknown>);
    expect(lines[0]).toMatchObject({
      dto: {
        organization: '0302',
        loginCardNo: '[REDACTED]',
        encryptedCardPassword: '[REDACTED]',
      },
    });
    expect(lines[1]).toMatchObject({
      codefRequest: {
        loginCardNo: '[REDACTED]',
        cardPassword: '[REDACTED]',
        cardNo: '[REDACTED]',
      },
    });
  });

  it('masks card keys by token (cardNum · card_pin · resCardNo · pan) without over-masking look-alikes (S8c review 3)', () => {
    let output = '';
    const logger = createLogger(
      new ConfigService({ NODE_ENV: 'production', LOG_LEVEL: 'info' }),
      { write: (line: string) => (output += line) },
    );
    logger.error(
      {
        x: {
          cardNum: 'leak-a',
          card_pin: 'leak-b',
          resCardNo: 'leak-c',
          PAN: 'leak-d',
          primary_account_number: 'leak-e',
          myCardPw: 'leak-f',
          company: 'keep-company',
          japan: 'keep-japan',
          expand: 'keep-expand',
        },
      },
      'keys',
    );
    expect(output).not.toContain('leak-');
    expect(output).toContain('keep-company');
    expect(output).toContain('keep-japan');
    expect(output).toContain('keep-expand');
  });

  it('blocks card numbers by value: messages, Error message·stack·cause and URL-encoded bodies (S8c review 3)', () => {
    let output = '';
    const logger = createLogger(
      new ConfigService({ NODE_ENV: 'production', LOG_LEVEL: 'info' }),
      { write: (line: string) => (output += line) },
    );
    const PAN = '5555555555554444';
    const pans = [
      PAN,
      '5555 5555 5555 4444',
      '5555-5555-5555-4444',
      // Amex 4-6-5 · 13자리 Visa · 은련(62, Luhn 무관)
      '3782 822463 10005',
      '4222222222222',
      '6253123456780001',
    ];
    // 카드번호가 든 에러를 그대로 남긴 실수
    const cause = new Error(`inner ${pans[1]}`);
    logger.error(new Error(`CODEF 요청 실패 loginCardNo=${PAN}`, { cause }));
    logger.error({ err: new Error(`카드 ${pans[2]} 확인`) }, '에러 필드');
    logger.warn(`메시지에 카드번호 ${pans[3]} 와 ${pans[4]}`);
    logger.info('포맷 인자 %s', pans[5]);
    logger.info(
      {
        payload: encodeURIComponent(JSON.stringify({ loginCardNo: PAN })),
        note: `free text ${PAN}.`,
      },
      'URL 인코딩 본문',
    );
    for (const pan of pans) expect(output).not.toContain(pan);
    expect(output).not.toContain(PAN.slice(0, 12));
    expect(output).toContain('[PAN]');
  });

  it('decodes URL-encoded bodies leniently: a stray "100%" or bad UTF-8 does not keep the raw card number (S8c review N4)', () => {
    let output = '';
    const logger = createLogger(
      new ConfigService({ NODE_ENV: 'production', LOG_LEVEL: 'info' }),
      { write: (line: string) => (output += line) },
    );
    const PAN = '5555555555554444';
    const encoded = encodeURIComponent(JSON.stringify({ loginCardNo: PAN }));
    // decodeURIComponent는 이 문자열 전체에서 예외를 던진다(" 100% " · "%E0%A4" 잘린 UTF-8)
    const mixed = [
      `rate 100% done&${encoded}`,
      `${encoded}%E0%A4&x=100%`,
      `%ZZ${encoded}`,
    ];
    for (const value of mixed) {
      expect(() => decodeURIComponent(value)).toThrow();
      logger.info({ payload: value }, 'mixed');
    }
    expect(output).not.toContain(PAN);
    expect(output.match(/\[PAN\]/g)).toHaveLength(3);
    // 카드번호가 없으면 원문 그대로(관대한 디코딩 결과로 바꾸지 않는다)
    output = '';
    logger.info(
      { payload: 'rate 100% done&a=%7B%22amount%22%3A18000%7D' },
      'plain',
    );
    expect(output).toContain('rate 100% done&a=%7B%22amount%22%3A18000%7D');
  });

  it('keeps ordinary numbers: amounts, ids, timestamps, phone and masked card numbers (S8c review 3)', () => {
    let output = '';
    const logger = createLogger(
      new ConfigService({ NODE_ENV: 'production', LOG_LEVEL: 'info' }),
      { write: (line: string) => (output += line) },
    );
    const keep = [
      '18000',
      '1000000000000',
      '1793000000000',
      '20190620120117',
      '11111111-1111-4111-8111-111111111111',
      'a3f1c0de-1234-5678-9abc-def012345678',
      '123-45-67890',
      '010-1234-5678',
      '9410********1934',
      '69331111',
      '12345678901234567890123',
      'E2E-APPROVAL-0001',
    ];
    logger.info(
      { values: keep, text: keep.join(' / ') },
      `numbers ${keep.join(' ')}`,
    );
    for (const value of keep) expect(output).toContain(value);
    expect(output).not.toContain('[PAN]');
  });

  it('masks by key at any depth: CODEF bodies, arrays, error causes and err.body (S8 review L1)', () => {
    let output = '';
    const logger = createLogger(
      new ConfigService({ NODE_ENV: 'production', LOG_LEVEL: 'info' }),
      { write: (line: string) => (output += line) },
    );
    const cause = Object.assign(new Error('inner'), {
      request: { body: { loginId: 'leak-cause-login' } },
    });
    const outer = Object.assign(new Error('outer', { cause }), {
      body: '{"id":"leak-err-body"}',
    });

    logger.error(
      { codefBody: { id: 'leak-codef-id', organization: '0306' } },
      'a',
    );
    logger.error({ x: { accountList: [{ id: 'leak-account-id' }] } }, 'b');
    logger.error({ err: outer }, 'c');
    logger.error(
      {
        deep: {
          a: { b: { c: { d: { e: { loginCardNo: 'leak-deep-card' } } } } },
        },
      },
      'd',
    );
    logger.error(
      { list: [{ nested: [{ encryptedPassword: 'leak-array-cipher' }] }] },
      'e',
    );
    logger.error({ step: { loginType: '1', id: 'leak-sibling-id' } }, 'f');
    logger.info(
      { accessLogId: 'keep-this-id', req: { id: 'keep-req-id' } },
      'g',
    );

    expect(output).not.toContain('leak-');
    expect(output).toContain('keep-this-id');
    const lines = output
      .trim()
      .split('\n')
      .map((l) => JSON.parse(l) as Record<string, unknown>);
    expect(lines[0]).toMatchObject({
      codefBody: { id: '[REDACTED]', organization: '0306' },
    });
    expect(lines[1]).toMatchObject({
      x: { accountList: [{ id: '[REDACTED]' }] },
    });
    expect(lines[2]).toMatchObject({
      err: { message: expect.stringContaining('outer'), body: '[REDACTED]' },
    });
  });

  it('normalizes key case and separators, masks SMS codes in card-import context and avoids over-masking (review Low 3)', () => {
    let output = '';
    const logger = createLogger(
      new ConfigService({ NODE_ENV: 'production', LOG_LEVEL: 'info' }),
      { write: (line: string) => (output += line) },
    );
    const shared = { label: 'keep-shared' };
    logger.error(
      {
        LoginId: 'leak-pascal',
        login_id: 'leak-snake',
        PASSWORD: 'leak-upper',
        'encrypted-password': 'leak-kebab',
        Connected_ID: 'leak-connected',
      },
      'a',
    );
    logger.error({ cardImportRequest: { code: 'leak-sms-1' } }, 'b');
    logger.error(
      { req2: { organization: '0306', loginId: 'x', code: 'leak-sms-2' } },
      'c',
    );
    logger.info(
      {
        item: { organization: '0306', id: 'keep-org-id' },
        a: shared,
        b: shared,
        result: { code: 'CF-00000' },
      },
      'd',
    );
    expect(output).not.toContain('leak-');
    const keep = output.trim().split('\n').at(-1) ?? '';
    expect(JSON.parse(keep)).toMatchObject({
      item: { organization: '0306', id: 'keep-org-id' },
      a: { label: 'keep-shared' },
      b: { label: 'keep-shared' },
      result: { code: 'CF-00000' },
    });
    const circular: Record<string, unknown> = { name: 'loop' };
    circular.self = circular;
    expect(() => logger.info({ circular }, 'e')).not.toThrow();
    expect(output).toContain('[Circular]');
  });
  it('redacts admin login credentials (username, password, passwordHash) at any depth (ADMIN)', () => {
    let output = '';
    const logger = createLogger(
      new ConfigService({ NODE_ENV: 'production', LOG_LEVEL: 'info' }),
      { write: (line: string) => (output += line) },
    );
    logger.warn(
      {
        dto: { username: 'ops-admin-xyz', password: 'pw-secret-123' },
        err: Object.assign(new Error('boom'), {
          cause: {
            request: { userName: 'ops-admin-xyz', password_hash: 'scrypt$1$2' },
          },
        }),
      },
      '관리자 로그인 본문을 남긴 실수',
    );
    expect(output).toContain('[REDACTED]');
    expect(output).not.toContain('ops-admin-xyz');
    expect(output).not.toContain('pw-secret-123');
    expect(output).not.toContain('scrypt$1$2');
  });
});
