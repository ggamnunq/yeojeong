import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { RouterProvider } from 'react-router'
import './index.css'
import { ApiProvider } from './api'
import { createAppRouter } from './app/router'
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

void enableMocking().then(() => {
  createRoot(document.getElementById('root')!).render(
    <StrictMode>
      <ApiProvider>
        <RouterProvider router={router} />
      </ApiProvider>
    </StrictMode>,
  )
})
