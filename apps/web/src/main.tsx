import { QueryErrorResetBoundary } from '@tanstack/react-query'
import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import { ApiProvider } from './api'
import App from './App.tsx'
import { ErrorBoundary } from './app/ErrorBoundary'
import { ToastHost } from './notifications'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ApiProvider>
      <QueryErrorResetBoundary>
        {({ reset }) => (
          <ErrorBoundary onReset={reset}>
            <App />
          </ErrorBoundary>
        )}
      </QueryErrorResetBoundary>
      {/* 경계 밖에 둬서 화면이 실패해도 토스트는 남는다. 지금 화면에는 하단 내비가 없다. */}
      <ToastHost aboveNav={false} />
    </ApiProvider>
  </StrictMode>,
)
