import { setupWorker } from 'msw/browser'
import { db } from './data'
import { handlers } from './handlers'
import { applyPerspective, edgeHandler, readScenario, scenarioFromUrl } from './scenario'

const SESSION_KEY = 'yj:mock:session'

/**
 * 개발 서버에서 VITE_MOCK_API=1일 때만 main.tsx가 동적으로 불러온다(운영 번들에 들어가지 않는다).
 * 로그인 전 화면: 콘솔에서 localStorage.setItem('yj:mock:session', 'ANONYMOUS') 후 새로고침.
 * 토스 연결 기능(features.accountLink) 켜기: localStorage.setItem('yj:mock:accountLink', '1') 후 새로고침.
 * 카드 내역 불러오기(features.cardImport) 켜기: localStorage.setItem('yj:mock:cardImport', '1') 후 새로고침
 *   ('low' = 오늘 남은 횟수 2, 'exhausted' = 0 — WF-53r · 57d 확인용). 시나리오 아이디는 features/card-import/mocks.ts 머리 주석.
 * QA 시나리오(시점 전환 · 엣지 응답 · 5명 넘는 진행 중 여정 · 패널)는 scenario.ts 머리 주석.
 */
export async function startMockWorker() {
  try {
    const session = localStorage.getItem(SESSION_KEY)
    if (session === 'ANONYMOUS' || session === 'SIGNUP_REQUIRED' || session === 'AUTHENTICATED') db.session = session
    if (db.session === 'SIGNUP_REQUIRED') db.signupReturnTo = localStorage.getItem('yj:mock:signupReturnTo')
    // 토스 연결 기능 플래그(FR-006). 기본 꺼짐, '1'이면 켠다
    db.accountLink = localStorage.getItem('yj:mock:accountLink') === '1'
    // 카드 내역 불러오기 기능 플래그(FR-830). 기본 꺼짐
    const cardImport = localStorage.getItem('yj:mock:cardImport')
    db.cardImport = cardImport === '1' || cardImport === 'low' || cardImport === 'exhausted'
    db.cardImportState.remaining = cardImport === 'low' ? 2 : cardImport === 'exhausted' ? 0 : null
  } catch {
    // 저장소를 못 쓰면 기본(로그인 상태)
  }
  scenarioFromUrl(window.location.search)
  const scenario = readScenario()
  applyPerspective(scenario.as)
  await setupWorker(edgeHandler, ...handlers).start({
    // /api 요청만 경고하고 Vite 모듈·폰트 같은 나머지는 그냥 보낸다
    onUnhandledFrame: ({ frame, defaults }) => {
      const request = (frame as { data?: { request?: Request } }).data?.request
      if (request && new URL(request.url).pathname.startsWith('/api/')) defaults.warn()
    },
  })
  if (scenario.panel) {
    // 앱과 섞이지 않게 별도 루트에 그린다
    const [{ DevPanel }, { createElement }, { createRoot }] = await Promise.all([
      import('./DevPanel'),
      import('react'),
      import('react-dom/client'),
    ])
    const host = document.createElement('div')
    host.dataset.mockPanel = ''
    document.body.append(host)
    createRoot(host).render(createElement(DevPanel))
  }
}
