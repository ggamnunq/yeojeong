import { luhnValid } from '@yeojeong/shared';
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
  // 관리자 2단계 인증 코드·시크릿
  'totp',
  'totpSecret',
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
  // 카드번호·카드 비밀번호(S8c 현대·하나): 서버 필드 loginCardNo·encryptedCardPassword, CODEF 본문 loginCardNo·cardPassword·cardNo, 화면 이름 cardNumber
  'cardNo',
  'loginCardNo',
  'cardNumber',
  'cardPassword',
  'birthDate',
  'identity',
  'access_token',
  'client_secret',
  'authorization',
  'cookie',
  // 거래 내역 파일 가져오기(W10): 거래 번호 원문(서버로 오지 않아야 한다)·다이제스트
  'txnNo',
  'txnNos',
  'txnDigest',
  // 요청·응답·CODEF 본문은 통째로(어느 깊이든: *.body, err.body, err.cause.request.body …)
  'body',
];
export const SENSITIVE_KEYS: ReadonlySet<string> = new Set(
  SENSITIVE.map(normalizeKey),
);
/**
 * 정규화한 키 이름에 이 토큰이 들어 있으면 카드번호·카드 비밀번호로 본다(S8c): loginCardNo · resCardNo · card_number · cardNum ·
 * cardPassword · encryptedCardPassword · cardPin …
 */
const CARD_KEY_TOKENS = ['cardno', 'cardnum', 'cardpass', 'cardpw', 'cardpin'];
/** 토큰으로 보면 오탐이 많은 짧은 이름은 정확히 같을 때만(pan · primaryAccountNumber) */
const CARD_KEY_EXACT: ReadonlySet<string> = new Set([
  'pan',
  'primaryaccountnumber',
]);

/** 가릴 키인가(정규화한 이름 기준) */
export function isSensitiveKey(normalized: string): boolean {
  return (
    SENSITIVE_KEYS.has(normalized) ||
    CARD_KEY_EXACT.has(normalized) ||
    CARD_KEY_TOKENS.some((token) => normalized.includes(token))
  );
}

// ─── 값 기반 카드번호(PAN) 차단 ───
// 키 이름과 무관하게 문자열 값(에러 메시지·stack·URL 인코딩 본문 포함) 안의 카드번호 모양을 [PAN]으로 바꾼다.
// 후보: 구분자 없는 13~19자리, 또는 4자리 묶음(4-4-4-1~7, 4-6-4~5)에 공백·하이픈 하나씩. 앞뒤가 영숫자·하이픈이면 후보가 아니다
// (UUID·해시·긴 숫자 일부를 잘라 보지 않는다). 후보는 Luhn이 맞거나 62(은련)로 시작할 때만 가린다.
// 오탐 줄이기: 13자리 1로 시작(epoch ms)과 14자리 19·20으로 시작(yyyyMMddHHmmss 시각)은 카드번호로 보지 않는다.
const PAN_CANDIDATE =
  /(?<![0-9A-Za-z-])(?:\d{13,19}|\d{4}([ -])\d{4}\1\d{4}\1\d{1,7}|\d{4}([ -])\d{6}\2\d{4,5})(?![0-9A-Za-z]|-[0-9A-Za-z])/g;
const PAN_CENSOR = '[PAN]';

function looksLikePan(candidate: string): boolean {
  const digits = candidate.replace(/[ -]/g, '');
  if (digits.length < 13 || digits.length > 19) return false;
  if (digits.length === 13 && digits.startsWith('1')) return false;
  if (digits.length === 14 && /^(19|20)/.test(digits)) return false;
  return digits.startsWith('62') || luhnValid(digits);
}

function replacePans(text: string): string {
  return text.replace(PAN_CANDIDATE, (match) =>
    looksLikePan(match) ? PAN_CENSOR : match,
  );
}

/**
 * 관대한 URL 디코딩: 연속한 %XX 묶음만 바꾼다. 묶음이 올바른 UTF-8이면 그 글자로, 아니면 바이트마다 latin1 글자로 바꾼다.
 * 나머지(" 100%" 같은 낱개 %, 잘못된 %Z1)는 그대로 둔다 — decodeURIComponent처럼 문자열 전체를 포기하지 않는다
 */
export function lenientUrlDecode(text: string): string {
  return text.replace(/(?:%[0-9A-Fa-f]{2})+/g, (run) => {
    try {
      return decodeURIComponent(run);
    } catch {
      return run.replace(/%([0-9A-Fa-f]{2})/g, (_m, hex: string) =>
        String.fromCharCode(parseInt(hex, 16)),
      );
    }
  });
}

/** 문자열 안의 카드번호 모양을 [PAN]으로. %XX가 있으면 관대하게 풀어서도 보고, 풀어서 걸리면 푼 문자열을 가려 돌려준다 */
export function redactPan(text: string): string {
  if (!/\d{4}/.test(text)) return text;
  const replaced = replacePans(text);
  if (/%[0-9A-Fa-f]{2}/.test(replaced)) {
    const decoded = lenientUrlDecode(replaced);
    const masked = replacePans(decoded);
    if (masked !== decoded) return masked;
  }
  return replaced;
}

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
  if (typeof value === 'string') return redactPan(value);
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
      if (isSensitiveKey(normalized)) {
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
