import { useQuery } from '@tanstack/react-query'
import type { HealthResponse } from '@yeojeong/shared'
import { apiFetch, keys } from '../../../api'
import { Logo } from '../../../ds'

type Check = 'checking' | 'up' | 'down'

export default function HealthPage() {
  // 실패하면(연결·5xx는 두 번 더 시도한 뒤) 전역 처리기가 「다시 시도」 토스트를 띄운다
  const health = useQuery({
    queryKey: keys.health,
    queryFn: ({ signal }) => apiFetch<HealthResponse>('/health', { signal }),
  })
  const server: Check = health.isSuccess ? 'up' : health.isError ? 'down' : 'checking'
  const db: Check = health.isSuccess ? health.data.db : health.isError ? 'down' : 'checking'

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

