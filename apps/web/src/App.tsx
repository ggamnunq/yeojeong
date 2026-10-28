import { useEffect, useState } from 'react'
import type { HealthResponse } from '@yeojeong/shared'

const API_URL = import.meta.env.VITE_API_URL ?? ''

type Check = 'checking' | 'up' | 'down'

function App() {
  const [server, setServer] = useState<Check>('checking')
  const [db, setDb] = useState<Check>('checking')

  useEffect(() => {
    fetch(`${API_URL}/api/health`)
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
        <h1 className="text-4xl font-bold tracking-tight text-gray-900">
          여정
        </h1>
        <p className="mt-2 text-gray-500">여행 공동 지갑 · 화면 준비 중</p>
      </header>
      <dl className="divide-y divide-gray-100 rounded-2xl border border-gray-200">
        <StatusRow label="서버" value={server} />
        <StatusRow label="DB" value={db} />
      </dl>
    </main>
  )
}

const dotColor: Record<Check, string> = {
  checking: 'bg-gray-300',
  up: 'bg-emerald-500',
  down: 'bg-red-500',
}

function StatusRow({ label, value }: { label: string; value: Check }) {
  return (
    <div className="flex items-center justify-between px-5 py-4">
      <dt className="text-gray-700">{label}</dt>
      <dd className="flex items-center gap-2 text-sm text-gray-500">
        <span className={`size-2 rounded-full ${dotColor[value]}`} />
        {value}
      </dd>
    </div>
  )
}

export default App
