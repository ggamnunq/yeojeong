import { useEffect, useState } from 'react'
import type { HealthResponse } from '@yeojeong/shared'
import { Logo } from './ds'

type Check = 'checking' | 'up' | 'down'

function App() {
  const [server, setServer] = useState<Check>('checking')
  const [db, setDb] = useState<Check>('checking')

  useEffect(() => {
    // 운영에서는 같은 origin의 Cloudflare Worker가, 로컬에서는 Vite 프록시가 /api를 API 서버로 넘긴다
    fetch('/api/health')
      .then((res) => {
        if (!res.ok) throw new Error(`HTTP ${res.status}`)
        return res.json() as Promise<HealthResponse>
      })
      .then((health) => {
        setServer('up')
        setDb(health.db)
      })
      .catch(() => {
        setServer('down')
        setDb('down')
      })
  }, [])

  return (
    <main className="mx-auto flex min-h-svh max-w-md flex-col justify-center gap-10 px-6">
      <header>
        <h1>
          <Logo height={40} />
        </h1>
        <p className="mt-3 text-body-m text-secondary">여행 공동 지갑 · 화면 준비 중</p>
      </header>
      <dl className="divide-y divide-default rounded-lg border border-default bg-surface">
        <StatusRow label="서버" value={server} />
        <StatusRow label="DB" value={db} />
      </dl>
    </main>
  )
}

const dotColor: Record<Check, string> = {
  checking: 'bg-neutral-300',
  up: 'bg-success-500',
  down: 'bg-error-500',
}

function StatusRow({ label, value }: { label: string; value: Check }) {
  return (
    <div className="flex items-center justify-between px-5 py-4">
      <dt className="text-body-m text-primary">{label}</dt>
      <dd className="flex items-center gap-2 text-body-s text-secondary">
        <span className={`size-2 rounded-full ${dotColor[value]}`} />
        {value}
      </dd>
    </div>
  )
}

export default App
