import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

// public/_headers(Cloudflare 정적 응답 헤더) 중 W8 초대 링크 규칙. 같은 헤더가 /*와 겹치면 쉼표로 이어지고
// 브라우저는 Referrer-Policy 목록의 마지막 정책을 쓰므로 /join 규칙이 /* 뒤에 있어야 한다
// vitest는 apps/web에서 돈다(jsdom이라 import.meta.url이 file: 주소가 아니다)
const headers = readFileSync(resolve(process.cwd(), 'public/_headers'), 'utf8')

describe('_headers — 초대 링크 /join(W8 보안 리뷰 L1)', () => {
  it('/join은 Referrer-Policy: no-referrer', () => {
    expect(headers).toMatch(/^\/join\n {2}Referrer-Policy: no-referrer$/m)
  })

  it('/join 규칙이 전역(/*) 규칙보다 뒤에 있다', () => {
    expect(headers.indexOf('\n/join\n')).toBeGreaterThan(headers.indexOf('/*\n'))
  })
})
