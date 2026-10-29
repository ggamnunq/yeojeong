import { matchRoutes, type RouteObject } from 'react-router'
import { isAbort, isApiError } from '../api/client'
import { BUILD_ID, checkBuild } from './buildInfo'
import { isChunkLoadError } from './chunkError'

// 화면에서 난 오류를 서버 로그로 보낸다(POST /api/client-errors → Cloud Logging event=client_error, docs/ops/client-errors.md).
// 원인 메시지를 알 수 없던 운영 사고(옛 탭의 「문제가 생겼어요」, 서버 로그엔 4xx/5xx 없음) 때문에 만들었다.
//
// 보내는 것: 빌드 ID, 경로 템플릿(/trips/:tripId/payments — 실제 ID·쿼리·해시 없음), 에러 이름, 가린 메시지(500자),
// 스택 앞 8줄의 파일 이름:줄:열, 브라우저 종류·주버전과 OS 종류, 어디서 잡았는지, chunk 실패인지, 배포된 빌드와 다른지.
// 보내지 않는 것: 개인정보, 입력값, 주소의 쿼리·해시(초대코드 #code=), 카드 관련 값, 전체 URL, 원문 User-Agent.
// 같은 오류는 이 탭(세션)에서 한 번만, 페이지 하나에서 최대 MAX_REPORTS_PER_PAGE건만 보낸다. 보내기 실패는 조용히 버린다.

export const CLIENT_ERRORS_URL = '/api/client-errors'
export const MAX_MESSAGE_LENGTH = 500
export const MAX_STACK_FRAMES = 8
export const MAX_REPORTS_PER_PAGE = 10
const SENT_KEY = 'yj:client-errors:sent'
const MAX_SENT_KEYS = 50
const UNKNOWN_ROUTE = '(unknown)'

/** 어디서 잡았는지: 에러 경계(라우트 에러 화면 포함) · window error · 처리 안 된 Promise 거부 */
export type ClientErrorSource = 'boundary' | 'window' | 'promise'

/** 서버 DTO(apps/api/src/client-errors)와 같은 모양 */
export type ClientErrorReport = {
  buildId: string
  route: string
  source: ClientErrorSource
  name: string
  message: string
  stack: string[]
  userAgent: string
  chunk: boolean
  /** 배포된 빌드(/version.json)와 다르면 true, 같으면 false. 확인하지 못했으면 없음 */
  staleBuild?: boolean
}

// ── 가리기 ─────────────────────────────────────────────────────────────

const URL_PATTERN = /\b(?:https?|wss?|blob|file):\/\/[^\s'"<>()]+/gi
const EMAIL = /[\w.+-]+@[\w-]+(?:\.[\w-]+)+/g
const UUID = /\b[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\b/gi
/** 카드 번호(PAN) 모양: 13~19자리 숫자, 사이에 공백·하이픈 허용 */
const PAN = /(?<![\d])\d(?:[ -]?\d){12,18}(?![\d])/g
/** 4자리 이상 숫자열(전화번호·금액·생년월일·카드 일부·기관 코드 등) */
const DIGITS = /\d{4,}/g
/** 쿼리·해시의 값(?code=…, #code=…, &token=…) */
const PARAM_VALUE = /([?#&;][\w.[\]-]{1,40}=)[^\s&#'"]*/g
/** 큰따옴표 안 문자열(JSON.parse 오류가 응답 일부를 싣는 등) */
const QUOTED = /"[^"]*"|“[^”]*”/g
/** 초대코드 모양(헷갈리는 문자를 뺀 대문자·숫자 6자, 숫자와 글자가 섞인 것). 3-3 표시형 포함 */
const INVITE_CODE = /\b(?=[2-9A-HJKMNP-Z-]*\d)(?=[2-9A-HJKMNP-Z-]*[A-HJKMNP-Z])(?:[2-9A-HJKMNP-Z]{6}|[2-9A-HJKMNP-Z]{3}-[2-9A-HJKMNP-Z]{3})\b/g
const HEX_TOKEN = /\b[0-9a-f]{16,}\b/gi
const LONG_TOKEN = /\b[\w-]{32,}\b/g

/** URL은 마지막 경로 조각(파일 이름)만 남긴다: https://jinyeojeong.com/assets/Join-3f9a.js?v=1#x → …/Join-3f9a.js */
function shortenUrl(url: string): string {
  const path = url.replace(/^[a-z]+:\/\/[^/]*/i, '').split(/[?#]/)[0]
  const file = path.split('/').filter(Boolean).pop()
  return file ? `…/${file}` : '…/'
}

/** 에러 메시지에서 개인정보·입력값이 될 수 있는 부분을 가리고 500자로 자른다 */
export function maskMessage(text: string): string {
  return text
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
    .slice(0, MAX_MESSAGE_LENGTH)
}

// Chromium: "    at fn (https://h/assets/a.js:1:2)" · "    at https://h/assets/a.js:1:2"
// Firefox·Safari: "fn@https://h/assets/a.js:1:2" · "@https://h/assets/a.js:1:2"
const FRAME_LOCATION = /(?:\(|@|\bat\s+)((?:[a-z][\w+.-]*:\/\/[^/\s)]*)?\/[^\s()]*?):(\d+):(\d+)\)?\s*$/i

/** 스택 → 앞 8줄의 "파일이름:줄:열". 같은 origin(또는 상대 경로) 파일만, 쿼리·해시·함수 이름·경로는 뺀다. 다른 origin은 (external) */
export function sanitizeStack(stack: string | undefined, origin = currentOrigin()): string[] {
  if (!stack) return []
  const frames: string[] = []
  for (const line of stack.split('\n')) {
    const match = FRAME_LOCATION.exec(line.trim())
    if (!match) continue
    const [, location, row, col] = match
    const external = /^[a-z][\w+.-]*:\/\//i.test(location) && !location.startsWith(`${origin}/`)
    // 서버가 받는 형식([\w.@$~+-] 100자)에 맞춘다
    const file = (location.split(/[?#]/)[0].split('/').filter(Boolean).pop() ?? '').replace(/[^\w.@$~+-]/g, '_').slice(0, 100)
    if (!external && !file) continue
    const frame = external ? '(external)' : `${file}:${row.slice(0, 7)}:${col.slice(0, 7)}`
    if (frames[frames.length - 1] !== frame) frames.push(frame)
    if (frames.length >= MAX_STACK_FRAMES) break
  }
  return frames
}

/**
 * 원문 User-Agent 대신 "브라우저 종류 주버전 / OS 종류"(예: "Safari 18 / iOS", 인앱 브라우저는 앱 이름만).
 * 지문을 줄이려고 OS 버전·세부 버전·기기 모델·빌드 문자열은 싣지 않는다(개인정보처리방침 "브라우저 종류·버전").
 * 서버도 같은 수준으로 다시 맞춘다(apps/api/src/client-errors/client-error-mask.ts normalizeClientUserAgent)
 */
export function summarizeUserAgent(ua: string): string {
  const os = /\b(?:iPhone|iPad|iPod)\b/.test(ua)
    ? 'iOS'
    : /Android/.test(ua)
      ? 'Android'
      : /Mac OS X/.test(ua)
        ? 'macOS'
        : /Windows/.test(ua)
          ? 'Windows'
          : /Linux/.test(ua)
            ? 'Linux'
            : 'other'
  const version = (pattern: RegExp) => pattern.exec(ua)?.[1] ?? '?'
  const browser = /KAKAOTALK/i.test(ua)
    ? 'KakaoTalk'
    : /NAVER\(/.test(ua)
      ? 'NAVER'
      : /Instagram/.test(ua)
        ? 'Instagram'
        : /FBAN|FBAV/.test(ua)
          ? 'Facebook'
          : /\bLine\//.test(ua)
            ? 'LINE'
            : /SamsungBrowser\//.test(ua)
              ? `Samsung ${version(/SamsungBrowser\/(\d+)/)}`
              : /EdgA?\/|EdgiOS\//.test(ua)
                ? `Edge ${version(/Edg(?:A|iOS)?\/(\d+)/)}`
                : /CriOS\//.test(ua)
                  ? `Chrome ${version(/CriOS\/(\d+)/)}`
                  : /FxiOS\//.test(ua)
                    ? `Firefox ${version(/FxiOS\/(\d+)/)}`
                    : /Firefox\//.test(ua)
                      ? `Firefox ${version(/Firefox\/(\d+)/)}`
                      : /Chrome\//.test(ua)
                        ? `Chrome ${version(/Chrome\/(\d+)/)}${/; wv\)/.test(ua) ? ' WebView' : ''}`
                        : /Version\/(\d+).*Safari/.test(ua)
                          ? `Safari ${version(/Version\/(\d+)/)}`
                          : /AppleWebKit/.test(ua)
                            ? 'WebKit'
                            : 'other'
  return `${browser} / ${os}`
}

// ── 경로 템플릿 ────────────────────────────────────────────────────────

let appRoutes: RouteObject[] = []

/** main.tsx가 라우트 트리를 알려 준다(경로 템플릿용) */
export function configureClientErrors(options: { routes: RouteObject[] }) {
  appRoutes = options.routes
}

/** 주소 → 라우트 템플릿. /trips/3f…/payments/9a… → /trips/:tripId/payments/:expenseId. 없는 화면은 '/*'(찾을 수 없음), 라우트를 모르면 (unknown) */
export function routeTemplate(routes: RouteObject[], pathname: string): string {
  const matches = matchRoutes(routes, pathname)
  if (!matches) return UNKNOWN_ROUTE
  let template = ''
  for (const { route } of matches) {
    const path = route.path
    if (!path) continue
    template = path.startsWith('/') ? path : `${template.replace(/\/$/, '')}/${path}`
  }
  return template || '/'
}

function currentRouteTemplate(): string {
  try {
    return routeTemplate(appRoutes, window.location.pathname)
  } catch {
    return UNKNOWN_ROUTE
  }
}

function currentOrigin(): string {
  try {
    return window.location.origin
  } catch {
    return ''
  }
}

// ── 만들기 · 보내기 ─────────────────────────────────────────────────────

/** 에러 → 보고 본문(빌드 확인 결과 제외). 보고하지 않을 에러(ApiError·취소)는 null */
export function buildReport(error: unknown, source: ClientErrorSource): ClientErrorReport | null {
  // API 실패는 서버가 요청 ID와 함께 이미 남긴다. 사용자가 취소한 요청은 오류가 아니다
  if (isApiError(error) || isAbort(error)) return null
  const isError = error instanceof Error
  const rawName = isError ? error.name : typeof error === 'object' && error !== null ? 'NonErrorObject' : 'NonError'
  const rawMessage = isError ? error.message : typeof error === 'string' ? error : ''
  return {
    buildId: BUILD_ID,
    route: currentRouteTemplate(),
    source,
    name: /^[\w$.-]{1,60}$/.test(rawName) ? rawName : 'Error',
    message: maskMessage(rawMessage),
    stack: isError ? sanitizeStack(error.stack) : [],
    userAgent: summarizeUserAgent(typeof navigator === 'undefined' ? '' : navigator.userAgent),
    chunk: isChunkLoadError(error),
  }
}

type Transport = (body: string) => void

const fetchTransport: Transport = (body) => {
  // keepalive: 사용자가 바로 「새로고침」을 눌러도 요청이 끝까지 간다. 같은 origin fetch라 Origin 헤더가 붙어 CSRF 검사를 통과한다
  void fetch(CLIENT_ERRORS_URL, {
    method: 'POST',
    keepalive: true,
    credentials: 'same-origin',
    headers: { 'content-type': 'application/json' },
    body,
  }).catch(() => {})
}

// 단위 테스트(Vitest)에서는 기본으로 보내지 않는다
let transport: Transport = import.meta.env.MODE === 'test' ? () => {} : fetchTransport
const sentThisPage = new Set<string>()

/** 테스트용: 보내는 방법을 바꾸고 중복 기록을 비운다 */
export function setClientErrorTransport(next: Transport | null) {
  transport = next ?? fetchTransport
  sentThisPage.clear()
}

/** 중복 억제 키(FNV-1a 32비트). 원문을 저장소에 남기지 않는다 */
function dedupeKey(report: ClientErrorReport): string {
  const text = `${report.name}|${report.message}|${report.route}|${report.source}`
  let hash = 0x811c9dc5
  for (let i = 0; i < text.length; i++) {
    hash ^= text.charCodeAt(i)
    hash = Math.imul(hash, 0x01000193)
  }
  return (hash >>> 0).toString(36)
}

function readSent(): string[] {
  try {
    const value: unknown = JSON.parse(sessionStorage.getItem(SENT_KEY) ?? '[]')
    return Array.isArray(value) ? value.filter((v): v is string => typeof v === 'string') : []
  } catch {
    return []
  }
}

/** 이 탭에서 처음 보는 오류면 기록하고 true */
function claim(key: string): boolean {
  if (sentThisPage.has(key) || sentThisPage.size >= MAX_REPORTS_PER_PAGE) return false
  const sent = readSent()
  if (sent.includes(key)) return false
  sentThisPage.add(key)
  try {
    sessionStorage.setItem(SENT_KEY, JSON.stringify([...sent, key].slice(-MAX_SENT_KEYS)))
  } catch {
    // 저장소를 못 쓰면 이 페이지에서만 거른다
  }
  return true
}

/**
 * 오류를 보고한다(던지지 않는다). 배포된 빌드와 다른지(/version.json) 확인한 뒤 보낸다.
 * @returns 보냈으면 그 본문, 거르거나 이미 보냈으면 null
 */
export async function reportClientError(error: unknown, source: ClientErrorSource): Promise<ClientErrorReport | null> {
  try {
    const report = buildReport(error, source)
    if (!report || !claim(dedupeKey(report))) return null
    const { freshness } = await checkBuild()
    const full: ClientErrorReport = freshness === 'unknown' ? report : { ...report, staleBuild: freshness === 'stale' }
    transport(JSON.stringify(full))
    return full
  } catch {
    return null
  }
}

/** window error · unhandledrejection을 보고한다. main.tsx가 한 번 부른다 */
export function installGlobalErrorReporting(target: Window = window): () => void {
  const onError = (event: ErrorEvent) => {
    // 다른 origin 스크립트(확장 프로그램 등)는 브라우저가 "Script error."로만 알려 준다 — 우리 코드가 아니다
    const origin = currentOrigin()
    if (event.filename && origin && !event.filename.startsWith(`${origin}/`)) return
    if (!event.error && /^Script error\.?$/.test(event.message)) return
    void reportClientError(event.error ?? event.message, 'window')
  }
  const onRejection = (event: PromiseRejectionEvent) => {
    void reportClientError(event.reason, 'promise')
  }
  target.addEventListener('error', onError)
  target.addEventListener('unhandledrejection', onRejection)
  return () => {
    target.removeEventListener('error', onError)
    target.removeEventListener('unhandledrejection', onRejection)
  }
}
