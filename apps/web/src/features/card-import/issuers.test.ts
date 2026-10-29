import { describe, expect, it } from 'vitest'
import { ISSUER_HOMEPAGES, ISSUER_ORDER, issuerHomepage, issuerInitial, issuerLogo, sortIssuers } from './issuers'

// W7e 카드사 표시: 화면 순서(Figma HF-52) · 로고 6곳 · 홈페이지 고정 URL(SOURCES.md 1절, 2026-10-30)

describe('카드사 표시(W7e)', () => {
  it('pins the homepage links to the fixed list — https, official hosts, Hana = home', () => {
    expect(ISSUER_HOMEPAGES).toEqual({
      '0301': 'https://card.kbcard.com/CMN/DVIEW/HOBMCXORMPIC0001',
      '0303': 'https://www.samsungcard.com/personal/login/UHPPCO0301M0.jsp',
      '0304': 'https://card.nonghyup.com/servlet/IpCo9151I.act',
      '0305': 'https://www.bccard.com/app/card/LoginPage.do?exec=newLogin',
      '0306': 'https://www.shinhancard.com/mob/MOBFM001N/MOBFM001C01.shc',
      '0309': 'https://pc.wooricard.com/dcpc/yh1/mmb/mmb01/H1MMB201S00.do',
      '0311': 'https://www.lottecard.co.kr/app/LPMANAA_V200.lc',
      '0302': 'https://www.hyundaicard.com/cpm/mb/CPMMB0101_01.hc',
      '0313': 'https://www.hanacard.co.kr/',
    })
    expect(Object.isFrozen(ISSUER_HOMEPAGES)).toBe(true)
    const hosts = Object.values(ISSUER_HOMEPAGES).map((u) => new URL(u))
    expect(hosts.every((u) => u.protocol === 'https:')).toBe(true)
    expect(hosts.map((u) => u.hostname)).toEqual([
      'card.kbcard.com',
      'www.samsungcard.com',
      'card.nonghyup.com',
      'www.bccard.com',
      'www.shinhancard.com',
      'pc.wooricard.com',
      'www.lottecard.co.kr',
      'www.hyundaicard.com',
      'www.hanacard.co.kr',
    ])
    // 목록 밖·프로토타입 키는 URL이 없다(링크 줄 숨김)
    expect(issuerHomepage('9999')).toBeUndefined()
    expect(issuerHomepage('toString')).toBeUndefined()
    expect(issuerHomepage('__proto__')).toBeUndefined()
  })

  it('has logos for KB·NH·BC·신한·우리·하나 and initials for 삼성·롯데·현대', () => {
    const withLogo = ISSUER_ORDER.filter((code) => issuerLogo(code))
    expect(withLogo).toEqual(['0301', '0304', '0305', '0306', '0309', '0313'])
    expect(issuerLogo('toString')).toBeUndefined()
    expect(issuerInitial({ code: '0303', name: '삼성카드' })).toBe('삼')
    expect(issuerInitial({ code: '0311', name: '롯데카드' })).toBe('롯')
    expect(issuerInitial({ code: '0302', name: '현대카드' })).toBe('현')
    expect(issuerInitial({ code: '9999', name: '새카드' })).toBe('새')
  })

  it('sorts in the Figma order without dropping or adding codes', () => {
    const server = ['0301', '0302', '0303', '0304', '0305', '0306', '0309', '0311', '0313'].map((code) => ({ code }))
    expect(sortIssuers(server).map((o) => o.code)).toEqual([...ISSUER_ORDER])
    expect(sortIssuers([{ code: '0398' }, { code: '0313' }, { code: '0397' }, { code: '0301' }]).map((o) => o.code)).toEqual([
      '0301',
      '0313',
      '0398',
      '0397',
    ])
    // 원본은 그대로
    expect(server[1].code).toBe('0302')
  })
})
