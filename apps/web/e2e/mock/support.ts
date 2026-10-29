import type { Page } from '@playwright/test'

// 목 개발 서버의 시나리오 스위치(src/mocks·features/*/mocks.ts의 localStorage 키). 페이지를 열기 전에 부른다.
export type MockScenario = {
  session?: 'AUTHENTICATED' | 'SIGNUP_REQUIRED' | 'ANONYMOUS'
  /** 지갑 목 상태: 'expired' | 'empty' | 'no-consent' */
  wallet?: 'expired' | 'empty' | 'no-consent'
  /** 세션 features.accountLink(토스 연결). 기본 false */
  accountLink?: boolean
  /** 세션 features.cardImport(카드 내역 불러오기). true = 켜짐, 'low' = 오늘 남은 횟수 2, 'exhausted' = 0. 기본 꺼짐 */
  cardImport?: boolean | 'low' | 'exhausted'
  /** 카드 내역 조회 동의가 서버에 남아 있는 상태로 시작(새로고침해도 유지). 기본 false */
  cardImportConsent?: boolean
  /** 세션 features.fileImport(위챗페이 파일 가져오기). 기본 false */
  fileImport?: boolean
  /** 재동의가 필요한 가입 동의(예: ['TOS', 'PRIVACY', 'AGE14']) — 정식 약관 시행 뒤 초안 동의자 */
  reconsent?: string[]
}

export async function useMockScenario(page: Page, scenario: MockScenario = {}) {
  await page.addInitScript((s) => {
    // 같은 컨텍스트에서 페이지를 다시 열어도 처음 값으로 시작한다
    if (sessionStorage.getItem('e2e:init')) return
    sessionStorage.setItem('e2e:init', '1')
    localStorage.clear()
    if (s.session) localStorage.setItem('yj:mock:session', s.session)
    if (s.wallet) localStorage.setItem('yj:mock:wallet', s.wallet)
    if (s.accountLink) localStorage.setItem('yj:mock:accountLink', '1')
    if (s.cardImport) localStorage.setItem('yj:mock:cardImport', s.cardImport === true ? '1' : s.cardImport)
    if (s.fileImport) localStorage.setItem('yj:mock:fileImport', '1')
    if (s.cardImportConsent) localStorage.setItem('yj:mock:cardImportConsent', '1')
    if (s.reconsent) localStorage.setItem('yj:mock:reconsent', s.reconsent.join(','))
  }, scenario)
}
