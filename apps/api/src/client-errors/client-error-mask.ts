// 화면 오류 메시지를 로그에 남기기 전에 한 번 더 가린다(화면 apps/web/src/app/clientErrors.ts maskMessage와 같은 규칙).
// 화면이 이미 가려 보내지만, 이 엔드포인트는 로그인 없이 열려 있어 아무 값이나 올 수 있으므로 서버가 믿지 않는다.

const URL_PATTERN = /\b(?:https?|wss?|blob|file):\/\/[^\s'"<>()]+/gi;
const EMAIL = /[\w.+-]+@[\w-]+(?:\.[\w-]+)+/g;
const UUID =
  /\b[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\b/gi;
/** 카드 번호(PAN) 모양: 13~19자리 숫자, 사이에 공백·하이픈 허용 */
const PAN = /(?<!\d)\d(?:[ -]?\d){12,18}(?!\d)/g;
/** 4자리 이상 숫자열(전화번호·금액·생년월일·카드 일부·기관 코드 등) */
const DIGITS = /\d{4,}/g;
const PARAM_VALUE = /([?#&;][\w.[\]-]{1,40}=)[^\s&#'"]*/g;
const QUOTED = /"[^"]*"|“[^”]*”/g;
/** 초대코드 모양(숫자와 글자가 섞인 대문자 6자, 3-3 표시형 포함) */
const INVITE_CODE =
  /\b(?=[2-9A-HJKMNP-Z-]*\d)(?=[2-9A-HJKMNP-Z-]*[A-HJKMNP-Z])(?:[2-9A-HJKMNP-Z]{6}|[2-9A-HJKMNP-Z]{3}-[2-9A-HJKMNP-Z]{3})\b/g;
const HEX_TOKEN = /\b[0-9a-f]{16,}\b/gi;
const LONG_TOKEN = /\b[\w-]{32,}\b/g;
/** 제어문자·줄 구분자·폭 없는 문자·방향 제어 문자(로그 화면에서 글을 숨기거나 뒤집는 데 쓰인다)·BOM */
const CONTROL =
  // oxlint-disable-next-line no-control-regex -- 로그에 제어문자를 남기지 않는다
  /[\u0000-\u001f\u007f-\u009f\u200b-\u200f\u2028-\u202e\u2066-\u2069\ufeff]/g;

function shortenUrl(url: string): string {
  const path = url.replace(/^[a-z]+:\/\/[^/]*/i, '').split(/[?#]/)[0];
  const file = path.split('/').filter(Boolean).pop();
  return file ? `…/${file}` : '…/';
}

export function maskClientErrorMessage(text: string, maxLength = 500): string {
  return text
    .replace(CONTROL, ' ')
    .replace(URL_PATTERN, shortenUrl)
    .replace(PARAM_VALUE, '$1[REDACTED]')
    .replace(QUOTED, '"[STR]"')
    .replace(EMAIL, '[EMAIL]')
    .replace(UUID, '[ID]')
    .replace(PAN, '[CARD]')
    .replace(HEX_TOKEN, '[HEX]')
    .replace(LONG_TOKEN, '[TOKEN]')
    .replace(DIGITS, '[NUM]')
    .replace(INVITE_CODE, '[CODE]')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, maxLength);
}

const BROWSERS = new Set([
  'Safari',
  'Chrome',
  'Firefox',
  'Edge',
  'Samsung',
  'KakaoTalk',
  'NAVER',
  'Instagram',
  'Facebook',
  'LINE',
  'WebKit',
]);
const OS_KINDS = new Set(['iOS', 'Android', 'macOS', 'Windows', 'Linux']);
const BROWSER_PART = /^([A-Za-z]+)(?: (\d{1,4}|\?))?( WebView)?$/;

/**
 * 화면이 보낸 브라우저 요약을 "브라우저 종류 [주버전][ WebView] / OS 종류"로 다시 맞춘다(지문 최소화).
 * OS 버전·세부 버전·기기 모델·빌드 문자열은 버리고, 모르는 이름은 other로 바꾼다.
 * 예: "Safari 18 / iOS 18" → "Safari 18 / iOS", "Chrome 141.0.7390 / Android 15" → "Chrome / Android"
 */
export function normalizeClientUserAgent(summary: string): string {
  const [browserPart = '', osPart = ''] = summary
    .split('/')
    .map((part) => part.trim());
  const match = BROWSER_PART.exec(browserPart);
  const name = match && BROWSERS.has(match[1]) ? match[1] : 'other';
  const major = name !== 'other' && match?.[2] ? ` ${match[2]}` : '';
  const webView = name === 'Chrome' && match?.[3] ? ' WebView' : '';
  const osKind = osPart.split(' ')[0];
  const os = OS_KINDS.has(osKind) ? osKind : 'other';
  return `${name}${major}${webView} / ${os}`;
}

/** 스택 한 줄(파일이름:줄:열)의 파일 이름만 가린다. 줄·열 번호는 위치를 찾는 데 필요해 그대로 둔다 */
export function maskStackFrame(frame: string): string {
  const match = /^(.*):(\d{1,7}):(\d{1,7})$/.exec(frame);
  if (!match) return maskClientErrorMessage(frame, 120);
  const [, file, line, column] = match;
  return `${maskClientErrorMessage(file, 100)}:${line}:${column}`;
}
