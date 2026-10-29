// 공급자 파서(wechat.ts · alipay.ts) 공용: 칸 읽기 · 금액 · 중국 표준시 시각 · 가맹점 이름 정리.

/** 중국 표준시(Asia/Shanghai, UTC+8, 서머타임 없음). 위챗·알리페이 파일 시각은 이 벽시계 값이다(KST로는 1시간 뒤) */
export const CHINA_OFFSET = '+08:00'

/** 헤더 이름 정규화: 공백(탭 포함) 제거, 전각 괄호 → 반각 */
export const normHeader = (s: string) => s.replace(/\s+/g, '').replace(/（/g, '(').replace(/）/g, ')').replace(/^\ufeff/, '')

/** 칸 하나에서 읽는 최대 글자 수. 더 긴 칸은 잘라 읽는다(정규식·메모리 방어 — 정상 칸은 수십 자) */
export const MAX_CELL_CHARS = 1_000

/** 칸 값: 1,000자까지, 앞뒤 공백·탭(위챗·알리페이 CSV는 숫자를 글자로 두려고 끝에 탭을 붙인다)·BOM 제거, "/"는 빈 값 */
export const cell = (row: readonly string[], index: number) => {
  const value = (row[index] ?? '').slice(0, MAX_CELL_CHARS).replace(/\uFEFF/g, '').trim()
  return value === '/' ? '' : value
}

/** 금액 → "123.45"(소수 2자리 고정). 기호·쉼표·공백을 지운다. 못 읽으면 null */
export function normalizeAmount(raw: string): string | null {
  const text = raw.replace(/[¥￥,\s元]/g, '')
  if (/^\d{1,12}(\.\d{1,2})?$/.test(text)) {
    const [int, frac = ''] = text.split('.')
    return `${String(Number(int))}.${frac.padEnd(2, '0')}`
  }
  // xlsx 숫자 칸의 부동소수(128.30000000000001)
  if (/^\d{1,12}\.\d+$/.test(text)) {
    const n = Number(text)
    return Number.isFinite(n) ? n.toFixed(2) : null
  }
  return null
}

/** 소수 2자리 decimal 문자열 → 1/100 단위 정수 */
export const cents = (amount: string) => {
  const [int, frac = ''] = amount.split('.')
  return Number(int) * 100 + Number(frac.padEnd(2, '0').slice(0, 2))
}
export const fromCents = (n: number) => `${Math.floor(n / 100)}.${String(n % 100).padStart(2, '0')}`

const pad = (n: number, width = 2) => String(n).padStart(width, '0')

/**
 * 시각 칸 → "YYYY-MM-DDTHH:mm:ss+08:00". 글자("2026-09-06 12:30:15" · "2026/9/6 12:30" · 초 없음) 또는
 * xlsx 날짜 일련번호(1900 체계, 1899-12-30 = 0)를 받는다. 못 읽으면 null
 */
export function normalizeChinaTime(raw: string): string | null {
  const text = raw.trim()
  const m = text.match(/^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})[ T]+(\d{1,2}):(\d{2})(?::(\d{2}))?$/)
  let parts: [number, number, number, number, number, number]
  if (m) {
    parts = [Number(m[1]), Number(m[2]), Number(m[3]), Number(m[4]), Number(m[5]), Number(m[6] ?? '0')]
  } else if (/^\d{5}(\.\d+)?$/.test(text)) {
    // 일련번호 → 벽시계(UTC 메서드로 읽어 시간대가 끼어들지 않게)
    const ms = Math.round((Number(text) - 25569) * 86_400) * 1000
    const d = new Date(ms)
    parts = [d.getUTCFullYear(), d.getUTCMonth() + 1, d.getUTCDate(), d.getUTCHours(), d.getUTCMinutes(), d.getUTCSeconds()]
  } else return null
  const [y, mo, d, h, mi, s] = parts
  // 날짜가 실제로 있는지(2월 30일 등) 확인
  const check = new Date(Date.UTC(y, mo - 1, d, h, mi, s))
  if (check.getUTCFullYear() !== y || check.getUTCMonth() !== mo - 1 || check.getUTCDate() !== d || h > 23 || mi > 59 || s > 59) return null
  return `${pad(y, 4)}-${pad(mo)}-${pad(d)}T${pad(h)}:${pad(mi)}:${pad(s)}${CHINA_OFFSET}`
}

const graphemes = new Intl.Segmenter('zh', { granularity: 'grapheme' })

/** 가맹점 이름: 제어문자·연속 공백 정리, 40자(보이는 글자 기준)까지 */
export function cleanMerchant(raw: string, max = 40): string {
  // 보이지 않는 서식 문자(양방향 제어·폭 없는 공백 등 \p{Cf})는 지운다. ZWJ(U+200D)는 이모지 묶음용이라 남긴다(서버 cleanMemo와 같다)
  const text = raw
    .replace(/(?!\u200d)\p{Cf}/gu, '')
    .replace(/[\p{Cc}\u2028\u2029]/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim()
  const chars = Array.from(graphemes.segment(text), (s) => s.segment)
  return chars.length > max ? chars.slice(0, max).join('').trim() : text
}
