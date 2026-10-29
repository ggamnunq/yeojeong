import type { CardImportOrganization } from '@yeojeong/shared'
import bcLogo from './assets/issuers/bc.svg'
import hanaLogo from './assets/issuers/hana.svg'
import kbLogo from './assets/issuers/kb.svg'
import nhLogo from './assets/issuers/nh.svg'
import shinhanLogo from './assets/issuers/shinhan.svg'
import wooriLogo from './assets/issuers/woori.svg'

// 카드사 표시(화면명세 WF-52 · WF-53 v0.7.6): 화면 순서 · 로고 타일(Tile/Issuer) · 홈페이지 링크(고정 목록).
// 서버 config는 기관 코드 순이라 화면이 Figma 순서로 다시 줄 세운다(README C-45). 서버는 로고·URL을 주지 않는다.
//
// 로고(assets/issuers/*.svg): 디자인 정리본(docs/design/assets/issuers/SOURCES.md 2절 — 공식 CI·사이트 원본을 벡터 변환, 2026-10-30 확인).
// path·fill·clipPath만 있고 script·이벤트 속성·외부 href·style이 없다. <img>로만 그린다(SVG 안 스크립트가 돌 수 없는 방식).
// 사용권(docs/legal L-28)은 전체 공개 전 확인 — "불가"면 아래 ISSUER_LOGOS를 비우면 같은 흰 원 이니셜 타일이 된다.

/** Figma HF-52 순서(9곳). 이 목록에 없는 코드는 서버 순서대로 뒤에 둔다 */
export const ISSUER_ORDER = ['0301', '0303', '0304', '0305', '0306', '0309', '0311', '0302', '0313'] as const

/** 화면 순서로 정렬(서버 응답은 바꾸지 않는다) */
export function sortIssuers<T extends Pick<CardImportOrganization, 'code'>>(organizations: readonly T[]): T[] {
  const rank = (code: string) => {
    const i = (ISSUER_ORDER as readonly string[]).indexOf(code)
    return i === -1 ? ISSUER_ORDER.length : i
  }
  // Array.prototype.sort는 안정 정렬이라 모르는 코드끼리는 서버 순서가 남는다
  return [...organizations].sort((a, b) => rank(a.code) - rank(b.code))
}

/** 공식 심볼을 확보한 6곳(KB·NH·BC·신한·우리·하나). 삼성·롯데·현대는 이니셜 타일 */
const ISSUER_LOGOS: Readonly<Record<string, string>> = {
  '0301': kbLogo,
  '0304': nhLogo,
  '0305': bcLogo,
  '0306': shinhanLogo,
  '0309': wooriLogo,
  '0313': hanaLogo,
}

/** 이니셜 타일 글자(서버가 주지 않아 기관 코드로 정한다). 모르는 코드는 이름 첫 글자 */
const ISSUER_INITIALS: Readonly<Record<string, string>> = {
  '0301': 'KB',
  '0302': '현',
  '0303': '삼',
  '0304': 'NH',
  '0305': 'BC',
  '0306': '신',
  '0309': '우',
  '0311': '롯',
  '0313': '하',
}

export const issuerInitial = (org: Pick<CardImportOrganization, 'code' | 'name'>) => ISSUER_INITIALS[org.code] ?? org.name.slice(0, 1)

export const issuerLogo = (code: string): string | undefined => (Object.hasOwn(ISSUER_LOGOS, code) ? ISSUER_LOGOS[code] : undefined)

/**
 * 카드사 홈페이지(로그인) 링크 — 고정 목록만 쓴다(화면명세 WF-53 "홈페이지 링크", SOURCES.md 1절, 2026-10-30 확인).
 * 서버 응답·사용자 입력·주소로 URL을 만들지 않는다. 하나카드는 별도 로그인 페이지가 GET으로 열리지 않아 홈.
 * 주소가 바뀌면 SOURCES.md와 이 상수를 같이 고친다
 */
export const ISSUER_HOMEPAGES: Readonly<Record<string, string>> = Object.freeze({
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

/** 목록에 있는 코드만 URL(없으면 링크 줄을 숨긴다) */
export const issuerHomepage = (code: string): string | undefined => (Object.hasOwn(ISSUER_HOMEPAGES, code) ? ISSUER_HOMEPAGES[code] : undefined)
