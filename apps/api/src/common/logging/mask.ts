import { pino } from 'pino';

/**
 * 키 이름으로 가리는 값(깊이 제한 없음). 금융기관 로그인 정보·CODEF 연결 값·S8 토큰.
 * pino redact(경로 목록)는 깊이·배열·에러 원인(cause)을 다 따라가지 못해 이 마스킹을 함께 쓴다.
 */
export const SENSITIVE_KEYS: ReadonlySet<string> = new Set([
  'loginId',
  'password',
  'encryptedPassword',
  'encryptedCardPassword',
  'connectedId',
  'twoWay',
  'twoWayToken',
  'twoWayInfo',
  'smsAuthNo',
  'smsCode',
  'secureNo',
  'secureNoRefresh',
  'simpleAuth',
  'captcha',
  'captchaImage',
  'authToken',
  'itemToken',
  'cardNo',
  'loginCardNo',
  'cardPassword',
  'birthDate',
  'identity',
  'access_token',
  'accessToken',
  'client_secret',
  'authorization',
  'cookie',
  // 요청·응답·CODEF 본문은 통째로(어느 깊이든: *.body, err.body, err.cause.request.body …)
  'body',
]);

const CENSOR = '[REDACTED]';
const MAX_DEPTH = 25;
/** 이 이름이 들어간 상위 키 아래의 `id`는 CODEF 로그인 아이디로 본다(예 codefBody.id, accountList[].id) */
const CODEF_CONTEXT = /codef|accountlist/i;
/** 같은 객체에 이 키가 있으면 그 객체의 `id`도 로그인 아이디로 본다(CODEF 계정·조회 본문 모양) */
const LOGIN_SIBLINGS = ['loginType', 'organization', 'password', 'connectedId'];

/** 일반 객체(직렬화된 에러처럼 프로토타입이 따로 있는 것 포함). Date·Buffer·Map 등은 건드리지 않는다 */
function isRecord(value: object): boolean {
  return Object.prototype.toString.call(value) === '[object Object]';
}

function walk(
  value: unknown,
  depth: number,
  codefContext: boolean,
  seen: WeakSet<object>,
): unknown {
  if (typeof value !== 'object' || value === null) return value;
  if (seen.has(value)) return '[Circular]';
  if (depth > MAX_DEPTH) return '[Truncated]';
  if (value instanceof Error) {
    // 에러는 원인(cause)까지 펼친 뒤 같은 규칙으로 가린다
    seen.add(value);
    return walk(
      pino.stdSerializers.errWithCause(value),
      depth + 1,
      codefContext,
      seen,
    );
  }
  if (Array.isArray(value)) {
    seen.add(value);
    return value.map((item) => walk(item, depth + 1, codefContext, seen));
  }
  if (!isRecord(value)) return value;
  seen.add(value);
  const record = value as Record<string, unknown>;
  const loginShaped = LOGIN_SIBLINGS.some((key) => key in record);
  const out: Record<string, unknown> = {};
  for (const [key, child] of Object.entries(record)) {
    if (SENSITIVE_KEYS.has(key)) {
      out[key] = CENSOR;
    } else if (key === 'id' && (codefContext || loginShaped)) {
      out[key] = CENSOR;
    } else {
      out[key] = walk(
        child,
        depth + 1,
        codefContext || CODEF_CONTEXT.test(key),
        seen,
      );
    }
  }
  return out;
}

/** 로그 객체 전체를 키 기반으로 가린다(원본은 바꾸지 않고 복사본을 돌려준다) */
export function maskLogObject<T extends object>(obj: T): T {
  return walk(obj, 0, false, new WeakSet()) as T;
}
