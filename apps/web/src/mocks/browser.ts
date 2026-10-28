import { setupWorker } from 'msw/browser'
import { db } from './data'
import { handlers } from './handlers'

const SESSION_KEY = 'yj:mock:session'

/**
 * 개발 서버에서 VITE_MOCK_API=1일 때만 main.tsx가 동적으로 불러온다(운영 번들에 들어가지 않는다).
 * 로그인 전 화면: 콘솔에서 localStorage.setItem('yj:mock:session', 'ANONYMOUS') 후 새로고침.
 */
export async function startMockWorker() {
  try {
    const session = localStorage.getItem(SESSION_KEY)
    if (session === 'ANONYMOUS' || session === 'SIGNUP_REQUIRED' || session === 'AUTHENTICATED') db.session = session
  } catch {
    // 저장소를 못 쓰면 기본(로그인 상태)
  }
  await setupWorker(...handlers).start({
    // /api 요청만 경고하고 Vite 모듈·폰트 같은 나머지는 그냥 보낸다
    onUnhandledFrame: ({ frame, defaults }) => {
      const request = (frame as { data?: { request?: Request } }).data?.request
      if (request && new URL(request.url).pathname.startsWith('/api/')) defaults.warn()
    },
  })
}
