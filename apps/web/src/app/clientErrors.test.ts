import { http, HttpResponse } from 'msw'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { ApiError } from '../api/client'
import { server } from '../mocks/server'
import { resetBuildCheck } from './buildInfo'
import { buildRoutes } from './router'
import {
  buildReport,
  configureClientErrors,
  installGlobalErrorReporting,
  maskMessage,
  MAX_REPORTS_PER_PAGE,
  reportClientError,
  routeTemplate,
  sanitizeStack,
  setClientErrorTransport,
  summarizeUserAgent,
  type ClientErrorReport,
} from './clientErrors'

let sent: ClientErrorReport[] = []
const routes = buildRoutes()

beforeEach(() => {
  sent = []
  setClientErrorTransport((body) => sent.push(JSON.parse(body) as ClientErrorReport))
  configureClientErrors({ routes })
  resetBuildCheck()
})

afterEach(() => {
  setClientErrorTransport(null)
  resetBuildCheck()
  window.history.replaceState(null, '', '/')
})

describe('maskMessage', () => {
  it.each([
    ['카드 번호', 'card 4111 1111 1111 1111 rejected', 'card [CARD] rejected'],
    ['붙어 쓴 카드 번호', 'pan=4111111111111111', 'pan=[CARD]'],
    ['하이픈 카드 번호', 'x 5500-0000-0000-0004 y', 'x [CARD] y'],
    ['이메일', 'user traveler.kim+1@example.co.kr not found', 'user [EMAIL] not found'],
    ['UUID', 'trip 3f2b1c4d-5e6f-4a7b-8c9d-0e1f2a3b4c5d missing', 'trip [ID] missing'],
    ['4자리 이상 숫자', 'amount 125000 KRW, phone 01012345678', 'amount [NUM] KRW, phone [NUM]'],
    ['초대코드', 'invalid invite K7M2QX / K7M-2QX', 'invalid invite [CODE] / [CODE]'],
    ['해시의 초대코드', 'nav to /join#code=K7M2QX failed', 'nav to /join#code=[REDACTED] failed'],
    ['쿼리 값', 'GET /login?returnTo=%2Ftrips&x=1 failed', 'GET /login?returnTo=[REDACTED]&x=[REDACTED] failed'],
    [
      'URL은 파일 이름만',
      'Failed to fetch dynamically imported module: https://jinyeojeong.com/assets/NewTripPage-B3x9aQ.js?import#code=AB',
      'Failed to fetch dynamically imported module: …/NewTripPage-B3x9aQ.js',
    ],
    ['큰따옴표 안 문자열(JSON 일부)', 'Unexpected token \'<\', "<!doctype "... is not valid JSON', 'Unexpected token \'<\', "[STR]"... is not valid JSON'],
    ['긴 토큰', 'token abcdefghijklmnopqrstuvwxyzABCDEFGH12 bad', 'token [TOKEN] bad'],
    ['16진 해시', 'hash deadbeefcafebabe0123 bad', 'hash [HEX] bad'],
  ])('%s', (_, input, expected) => {
    expect(maskMessage(input)).toBe(expected)
  })

  it('보통의 에러 문구는 그대로 둔다', () => {
    expect(maskMessage("Cannot read properties of undefined (reading 'members')")).toBe(
      "Cannot read properties of undefined (reading 'members')",
    )
    expect(maskMessage('Minified React error #418; visit https://react.dev/errors/418?args[]=hello for the full message')).toBe(
      'Minified React error #418; visit …/418 for the full message',
    )
  })

  it('500자로 자르고 공백을 줄인다', () => {
    expect(maskMessage(`a\n\n  b ${'word '.repeat(300)}`)).toHaveLength(500)
    expect(maskMessage('a\n\n  b')).toBe('a b')
  })
})

describe('sanitizeStack', () => {
  const origin = 'https://jinyeojeong.com'

  it('Chromium 스택 → 파일이름:줄:열(쿼리·함수 이름·경로 없음), 다른 origin은 (external)', () => {
    const stack = [
      "TypeError: Cannot read properties of undefined (reading 'x')",
      '    at NewTripPage (https://jinyeojeong.com/assets/NewTripPage-B3x9aQ.js?v=2#code=K7M2QX:1:2345)',
      '    at https://jinyeojeong.com/assets/index-Cx1.js:12:9',
      '    at chrome-extension://abcdef/content.js:1:1',
      '    at async Promise.all (index 0)',
    ].join('\n')
    expect(sanitizeStack(stack, origin)).toEqual(['NewTripPage-B3x9aQ.js:1:2345', 'index-Cx1.js:12:9', '(external)'])
  })

  it('Safari·Firefox 스택', () => {
    const stack = [
      'NewTripPage@https://jinyeojeong.com/assets/NewTripPage-B3x9aQ.js:1:2345',
      '@https://jinyeojeong.com/assets/index-Cx1.js:12:9',
      'forEach@[native code]',
    ].join('\n')
    expect(sanitizeStack(stack, origin)).toEqual(['NewTripPage-B3x9aQ.js:1:2345', 'index-Cx1.js:12:9'])
  })

  it('앞 8줄만, 같은 줄이 이어지면 한 번만', () => {
    const lines = Array.from({ length: 20 }, (_, i) => `    at f (https://jinyeojeong.com/assets/a.js:${i}:1)`)
    expect(sanitizeStack(['Error', ...lines].join('\n'), origin)).toHaveLength(8)
    const repeated = Array.from({ length: 5 }, () => 'f@https://evil.example/x.js:1:1').join('\n')
    expect(sanitizeStack(repeated, origin)).toEqual(['(external)'])
  })

  it('스택이 없으면 빈 배열', () => {
    expect(sanitizeStack(undefined, origin)).toEqual([])
  })
})

describe('summarizeUserAgent', () => {
  it.each([
    [
      'Mozilla/5.0 (iPhone; CPU iPhone OS 18_6 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.6 Mobile/15E148 Safari/604.1',
      'Safari 18 / iOS 18',
    ],
    [
      'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 KAKAOTALK 10.8.5',
      'KakaoTalk / iOS 17',
    ],
    [
      'Mozilla/5.0 (Linux; Android 15; SM-S928N) AppleWebKit/537.36 (KHTML, like Gecko) SamsungBrowser/27.0 Chrome/125.0.0.0 Mobile Safari/537.36',
      'Samsung 27 / Android 15',
    ],
    [
      'Mozilla/5.0 (Linux; Android 14; Pixel 7; wv) AppleWebKit/537.36 (KHTML, like Gecko) Version/4.0 Chrome/141.0.0.0 Mobile Safari/537.36',
      'Chrome 141 WebView / Android 14',
    ],
    [
      'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0.0.0 Safari/537.36',
      'Chrome 141 / macOS',
    ],
    ['Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:144.0) Gecko/20100101 Firefox/144.0', 'Firefox 144 / Windows'],
    ['', 'other / other'],
  ])('%s', (ua, expected) => {
    expect(summarizeUserAgent(ua)).toBe(expected)
  })
})

describe('routeTemplate', () => {
  it.each([
    ['/trips/new', '/trips/new'],
    ['/join', '/join'],
    ['/trips/3f2b1c4d-5e6f-4a7b-8c9d-0e1f2a3b4c5d/info', '/trips/:tripId/info'],
    ['/trips/3f2b1c4d-5e6f-4a7b-8c9d-0e1f2a3b4c5d/payments/9a8b7c6d-5e4f-4a3b-8c2d-1e0f9a8b7c6d', '/trips/:tripId/payments/:expenseId'],
    ['/trips/3f2b1c4d-5e6f-4a7b-8c9d-0e1f2a3b4c5d', '/trips/:tripId'],
    ['/wallet/import/0306', '/wallet/import/:issuer'],
    ['/no/such/page/K7M2QX', '/*'],
  ])('%s → %s', (pathname, expected) => {
    expect(routeTemplate(routes, pathname)).toBe(expected)
  })

  it('라우트를 모르면 (unknown)', () => {
    expect(routeTemplate([], '/trips/abc')).toBe('(unknown)')
  })
})

describe('buildReport · reportClientError', () => {
  it('보고 본문: 경로 템플릿(실제 ID·쿼리·해시 없음), 가린 메시지, 스택 파일 이름, UA 요약', async () => {
    window.history.replaceState(null, '', '/trips/3f2b1c4d-5e6f-4a7b-8c9d-0e1f2a3b4c5d/edit?step=2#code=K7M2QX')
    const error = new TypeError('budget 1250000 for traveler@example.com')
    error.stack = `TypeError: budget\n    at x (${window.location.origin}/assets/EditTripPage-Ab12.js?v=1:3:14)`

    const report = await reportClientError(error, 'window')

    expect(report).toEqual({
      buildId: 'dev',
      route: '/trips/:tripId/edit',
      source: 'window',
      name: 'TypeError',
      message: 'budget [NUM] for [EMAIL]',
      stack: ['EditTripPage-Ab12.js:3:14'],
      userAgent: expect.any(String),
      chunk: false,
      staleBuild: false,
    })
    expect(sent).toEqual([report])
    const raw = JSON.stringify(sent)
    expect(raw).not.toMatch(/3f2b1c4d|K7M2QX|step=2|1250000|traveler|example\.com/)
  })

  it('배포된 빌드를 확인하지 못하면 staleBuild를 싣지 않는다', async () => {
    server.use(http.get('/version.json', () => new HttpResponse(null, { status: 404 })))
    const report = await reportClientError(new Error('boom'), 'promise')
    expect(report).not.toHaveProperty('staleBuild')
  })

  it('ApiError·취소는 보고하지 않는다(서버가 이미 남긴다)', async () => {
    const apiError = new ApiError({ code: 'INTERNAL_ERROR', message: '일시적인 문제', status: 500 })
    expect(buildReport(apiError, 'boundary')).toBeNull()
    expect(buildReport(new DOMException('aborted', 'AbortError'), 'promise')).toBeNull()
    expect(await reportClientError(apiError, 'boundary')).toBeNull()
    expect(sent).toHaveLength(0)
  })

  it('Error가 아닌 값도 이름만 바꿔 보낸다', () => {
    expect(buildReport('plain 4111111111111111', 'promise')).toMatchObject({ name: 'NonError', message: 'plain [CARD]', stack: [] })
    expect(buildReport({ secret: 'x' }, 'promise')).toMatchObject({ name: 'NonErrorObject', message: '' })
  })

  it('이상한 이름은 Error로', () => {
    const error = new Error('x')
    error.name = '<script>alert(1)</script>'
    expect(buildReport(error, 'window')?.name).toBe('Error')
  })

  it('같은 오류는 세션(sessionStorage)에 한 번만, 페이지당 최대 10건', async () => {
    await reportClientError(new Error('same'), 'window')
    await reportClientError(new Error('same'), 'window')
    expect(sent).toHaveLength(1)

    // 새 페이지(메모리 초기화)라도 같은 탭이면 다시 보내지 않는다
    setClientErrorTransport((body) => sent.push(JSON.parse(body) as ClientErrorReport))
    await reportClientError(new Error('same'), 'window')
    expect(sent).toHaveLength(1)

    for (let i = 0; i < 20; i++) await reportClientError(new Error(`different ${String.fromCharCode(97 + i)}`), 'window')
    expect(sent).toHaveLength(1 + MAX_REPORTS_PER_PAGE)
  })
})

describe('installGlobalErrorReporting', () => {
  it('window error · unhandledrejection을 보고하고, 다른 origin 스크립트 오류는 거른다', async () => {
    const dispose = installGlobalErrorReporting()
    try {
      window.dispatchEvent(
        new ErrorEvent('error', { error: new TypeError('own bug'), message: 'own bug', filename: `${window.location.origin}/assets/a.js` }),
      )
      window.dispatchEvent(new ErrorEvent('error', { message: 'Script error.', filename: '' }))
      window.dispatchEvent(
        new ErrorEvent('error', { error: new Error('ext'), message: 'ext', filename: 'chrome-extension://abc/x.js' }),
      )
      const rejection = new Event('unhandledrejection') as PromiseRejectionEvent
      Object.defineProperty(rejection, 'reason', { value: new RangeError('bad range') })
      window.dispatchEvent(rejection)

      await expect.poll(() => sent.map((r) => `${r.source}:${r.name}:${r.message}`).sort()).toEqual([
        'promise:RangeError:bad range',
        'window:TypeError:own bug',
      ])
    } finally {
      dispose()
    }
  })
})
