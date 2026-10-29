import type { IncomingMessage, ServerResponse } from 'node:http';
import type { ConfigService } from '@nestjs/config';
import {
  pino,
  type DestinationStream,
  type Logger,
  type LoggerOptions,
} from 'pino';

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
const REDACT_PATHS = [
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
      err: pino.stdSerializers.err,
    },
  };

  if (production) {
    // 운영은 JSON 한 줄. Cloud Logging이 level 대신 severity를 읽는다.
    options.formatters = {
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
