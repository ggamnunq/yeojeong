import type { IncomingMessage, ServerResponse } from 'node:http';
import type { ConfigService } from '@nestjs/config';
import {
  pino,
  type DestinationStream,
  type Logger,
  type LoggerOptions,
} from 'pino';
import { maskLogObject, redactPan } from './mask.js';

// Cloud Logging이 인식하는 severity 값
const SEVERITY: Record<string, string> = {
  trace: 'DEBUG',
  debug: 'DEBUG',
  info: 'INFO',
  warn: 'WARNING',
  error: 'ERROR',
  fatal: 'CRITICAL',
};

// 헤더는 기본으로 기록하지 않지만, 실수로 객체째 남겨도 인증 정보는 가린다
const HEADER_REDACT_PATHS = [
  'authorization',
  'cookie',
  'set-cookie',
  'x-origin-auth',
  'x-internal-job-secret',
].flatMap((name) => [
  `headers["${name}"]`,
  `req.headers["${name}"]`,
  `res.headers["${name}"]`,
]);

/**
 * 금융기관 로그인 정보·CODEF 연결 값(S8 카드 승인내역 불러오기). 요청 본문은 원래 남기지 않지만(req 직렬화는 method·id만),
 * 실수로 본문·DTO·에러 객체째 남겨도 이 키는 깊이 3단계까지 가린다. 키 이름은 우리 DTO와 CODEF 요청·응답 필드 이름이다.
 */
export const SENSITIVE_BODY_KEYS = [
  'loginId',
  'password',
  // 관리자 로그인(src/admin)
  'username',
  'passwordHash',
  'totp',
  'totpSecret',
  'encryptedPassword',
  'connectedId',
  'twoWay',
  'twoWayToken',
  'twoWayInfo',
  'smsAuthNo',
  'secureNo',
  'secureNoRefresh',
  'simpleAuth',
  'smsCode',
  'captcha',
  'captchaImage',
  'authToken',
  'cardNo',
  'loginCardNo',
  'cardNumber',
  'cardPassword',
  'encryptedCardPassword',
  'itemToken',
  'birthDate',
  'identity',
  'access_token',
  'accessToken',
  'client_secret',
] as const;

const BODY_REDACT_PATHS = [
  'body',
  'req.body',
  'request.body',
  ...SENSITIVE_BODY_KEYS.flatMap((key) => [
    key,
    `*.${key}`,
    `*.*.${key}`,
    `*.*.*.${key}`,
  ]),
];

const REDACT_PATHS = [...HEADER_REDACT_PATHS, ...BODY_REDACT_PATHS];

export function createLogger(
  config: ConfigService,
  destination?: DestinationStream,
): Logger {
  const env = config.get<string>('NODE_ENV');
  const production = env === 'production';

  const options: LoggerOptions = {
    level: config.get<string>('LOG_LEVEL') || defaultLevel(env),
    base: null,
    messageKey: 'message',
    timestamp: pino.stdTimeFunctions.isoTime,
    redact: { paths: REDACT_PATHS, censor: '[REDACTED]' },
    // 요청·응답 객체를 남겨도 본문과 헤더는 빠지게 한다
    serializers: {
      req: (req: IncomingMessage) => ({ method: req.method, id: req.id }),
      res: (res: ServerResponse) => ({ statusCode: res.statusCode }),
      err: (err: Error) => maskLogObject(pino.stdSerializers.errWithCause(err)),
    },
    // 경로 목록(redact)이 놓치는 깊이·배열·에러 원인까지 키 이름으로 한 번 더 가린다(common/logging/mask.ts)
    formatters: { log: (obj) => maskLogObject(obj) },
    // 메시지 문자열(첫 문자열 인자·포맷 인자)의 카드번호 모양도 [PAN]으로(값 기반 차단, mask.ts redactPan)
    hooks: {
      logMethod(args, method) {
        const masked = args.map((arg: unknown) =>
          typeof arg === 'string' ? redactPan(arg) : arg,
        ) as unknown[];
        // logger.error(err)처럼 메시지 없이 에러만 넘기면 pino가 err.message를 메시지로 쓴다 — 가린 메시지를 직접 넘긴다
        const [first, second] = masked;
        const error =
          first instanceof Error
            ? first
            : first && typeof first === 'object' && 'err' in first
              ? (first as { err?: unknown }).err
              : undefined;
        if (error instanceof Error && typeof second !== 'string') {
          masked.splice(1, 0, redactPan(error.message));
        }
        method.apply(this, masked as typeof args);
      },
    },
  };

  if (production) {
    // 운영은 JSON 한 줄. Cloud Logging이 level 대신 severity를 읽는다.
    options.formatters = {
      ...options.formatters,
      level: (label) => ({ severity: SEVERITY[label] ?? 'DEFAULT' }),
    };
  } else if (!destination && env !== 'test') {
    options.transport = {
      target: 'pino-pretty',
      options: {
        messageKey: 'message',
        singleLine: true,
        translateTime: 'SYS:HH:MM:ss.l',
      },
    };
  }

  return pino(options, destination);
}

function defaultLevel(env: string | undefined) {
  if (env === 'production') return 'info';
  if (env === 'test') return 'silent';
  return 'debug';
}
