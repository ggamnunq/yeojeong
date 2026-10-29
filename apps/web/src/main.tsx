import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { RouterProvider } from 'react-router'
import './index.css'
import { ApiProvider } from './api'
import { configureClientErrors, installGlobalErrorReporting } from './app/clientErrors'
import { createAppRouter } from './app/router'
import { installStaleBundleWatch } from './app/staleBundle'
import { captureInviteLink } from './features/trips/pendingInvite'

async function enableMocking() {
  // DEV가 false인 운영 빌드에서는 이 분기와 msw chunk가 통째로 빠진다
  if (import.meta.env.DEV && import.meta.env.VITE_MOCK_API === '1') {
    const { startMockWorker } = await import('./mocks/browser')
    await startMockWorker()
  }
}

// QR·공유 링크(/join#code=…, 예전 ?code=…): 라우터가 주소를 읽기 전에 코드를 이 탭에 보관하고 주소에서 지운다(W8 · HF-62)
captureInviteLink()
const router = createAppRouter()

// 화면 오류를 서버 로그로 보내고(경로는 라우트 템플릿으로만), 오래 열어 둔 탭은 안전한 때 새 번들로 바꾼다(docs/ops/client-errors.md)
configureClientErrors({ routes: router.routes })
installGlobalErrorReporting()
installStaleBundleWatch({ router })

void enableMocking().then(() => {
  createRoot(document.getElementById('root')!).render(
    <StrictMode>
      <ApiProvider>
        <RouterProvider router={router} />
      </ApiProvider>
    </StrictMode>,
  )
})
