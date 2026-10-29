import { pino } from 'pino';

/** 키 이름 정규화: 소문자 + 영숫자만(loginId · LoginId · login_id · LOGIN-ID → loginid) */
export const normalizeKey = (key: string) =>
  key.toLowerCase().replace(/[^a-z0-9]/g, '');

/**
 * 키 이름으로 가리는 값(깊이 제한 없음, 대소문자·구분자 무시). 금융기관 로그인 정보·CODEF 연결 값·S8 토큰.
 * pino redact(경로 목록)는 깊이·배열·에러 원인(cause)을 다 따라가지 못해 이 마스킹을 함께 쓴다.
 */
const SENSITIVE = [
  'loginId',
  'password',
  // 관리자 로그인(src/admin) 아이디. 비밀번호는 위 password로 가린다
  'username',
  'passwordHash',
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
  'client_secret',
  'authorization',
  'cookie',
  // 요청·응답·CODEF 본문은 통째로(어느 깊이든: *.body, err.body, err.cause.request.body …)
  'body',
];
export const SENSITIVE_KEYS: ReadonlySet<string> = new Set(
  SENSITIVE.map(normalizeKey),
);

const CENSOR = '[REDACTED]';
const MAX_DEPTH = 25;
/** 이 이름이 들어간 상위 키 아래의 `id`·`code`는 로그인 아이디·인증번호로 본다(예 codefBody.id, accountList[].id, cardImportRequest.code) */
const CODEF_CONTEXT = /codef|accountlist|cardimport|twoway|smsauth/;
/** 같은 객체에 이 키가 있으면 그 객체를 CODEF 로그인·카드 불러오기 요청 본문으로 본다(`id`·`code`를 가린다). organization만으로는 보지 않는다 */
const LOGIN_SIBLINGS = new Set(
  ['loginType', 'password', 'encryptedPassword', 'connectedId', 'loginId'].map(
    normalizeKey,
  ),
);
/** 문맥이 있을 때만 가리는 키 */
const CONTEXT_KEYS = new Set(['id', 'code']);

/** 일반 객체(직렬화된 에러처럼 프로토타입이 따로 있는 것 포함). Date·Buffer·Map 등은 건드리지 않는다 */
function isRecord(value: object): boolean {
  return Object.prototype.toString.call(value) === '[object Object]';
}

/**
 * ancestors: 지금 내려온 경로의 객체들 — 진짜 순환일 때만 [Circular]이고, 같은 객체를 두 번 참조해도(형제) 그대로 펼친다
 */
function walk(
  value: unknown,
  depth: number,
  context: boolean,
  ancestors: Set<object>,
): unknown {
  if (typeof value !== 'object' || value === null) return value;
  if (ancestors.has(value)) return '[Circular]';
  if (depth > MAX_DEPTH) return '[Truncated]';
  ancestors.add(value);
  try {
    if (value instanceof Error) {
      // 에러는 원인(cause)까지 펼친 뒤 같은 규칙으로 가린다
      return walk(
        pino.stdSerializers.errWithCause(value),
        depth + 1,
        context,
        ancestors,
      );
    }
    if (Array.isArray(value)) {
      return value.map((item) => walk(item, depth + 1, context, ancestors));
    }
    if (!isRecord(value)) return value;
    const record = value as Record<string, unknown>;
    const keys = Object.keys(record);
    const loginShaped = keys.some((key) =>
      LOGIN_SIBLINGS.has(normalizeKey(key)),
    );
    const out: Record<string, unknown> = {};
    for (const key of keys) {
      const normalized = normalizeKey(key);
      if (SENSITIVE_KEYS.has(normalized)) {
        out[key] = CENSOR;
      } else if (CONTEXT_KEYS.has(normalized) && (context || loginShaped)) {
        out[key] = CENSOR;
      } else {
        out[key] = walk(
          record[key],
          depth + 1,
          context || CODEF_CONTEXT.test(normalized),
          ancestors,
        );
      }
    }
    return out;
  } finally {
    ancestors.delete(value);
  }
}

/** 로그 객체 전체를 키 기반으로 가린다(원본은 바꾸지 않고 복사본을 돌려준다) */
export function maskLogObject<T extends object>(obj: T): T {
  return walk(obj, 0, false, new Set()) as T;
}
