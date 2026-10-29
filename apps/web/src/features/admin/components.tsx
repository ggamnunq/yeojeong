import { clsx } from 'clsx'
import type { ReactNode } from 'react'
import type { AdminUserStatus } from '@yeojeong/shared'
import { isApiError } from '../../api'
import { Tag } from '../../ds'

// 관리자 화면 공통 틀. 데스크톱 폭에서 읽기 좋게 두되, 표는 자기 상자 안에서만 가로로 넘친다(페이지 가로 스크롤 없음).

export function Section({ title, actions, children, className }: { title: string; actions?: ReactNode; children: ReactNode; className?: string }) {
  return (
    <section aria-label={title} className={clsx('flex min-w-0 flex-col gap-3', className)}>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-h3 text-primary">{title}</h2>
        {actions}
      </div>
      {children}
    </section>
  )
}

/** 표 상자: 좁은 화면에서는 이 안에서만 가로 스크롤 */
export function TableBox({ children, label }: { children: ReactNode; label: string }) {
  return (
    <div role="region" aria-label={label} tabIndex={0} className="min-w-0 overflow-x-auto rounded-lg bg-surface shadow-elevation-1">
      {children}
    </div>
  )
}

export function Table({ children, minWidth = 'min-w-[640px]' }: { children: ReactNode; minWidth?: string }) {
  return <table className={clsx('w-full border-collapse text-left text-body-s', minWidth)}>{children}</table>
}

export function Th({ children, align = 'left' }: { children: ReactNode; align?: 'left' | 'right' }) {
  return (
    <th
      scope="col"
      className={clsx(
        'border-b border-default bg-subtle px-4 py-2.5 text-body-s-strong whitespace-nowrap text-secondary',
        align === 'right' && 'text-right',
      )}
    >
      {children}
    </th>
  )
}

export function Td({ children, align = 'left', mono = false }: { children: ReactNode; align?: 'left' | 'right'; mono?: boolean }) {
  return (
    <td
      className={clsx(
        'border-b border-default px-4 py-2.5 align-middle whitespace-nowrap text-primary',
        align === 'right' && 'text-right font-amount',
        mono && 'font-mono text-caption',
      )}
    >
      {children}
    </td>
  )
}

/** 숫자 하나 카드(호출 수·건수 — 원화가 아니라 DS StatCard 대신 같은 면·그림자로) */
export function Metric({ label, value, sub }: { label: string; value: ReactNode; sub?: ReactNode }) {
  return (
    <div role="group" aria-label={label} className="flex min-w-0 flex-col gap-1 rounded-xl bg-surface p-5 shadow-elevation-1">
      <p className="text-body-s-strong text-secondary">{label}</p>
      <p className="font-amount text-amount-m text-primary">{value}</p>
      {sub != null && <p className="text-caption text-tertiary">{sub}</p>}
    </div>
  )
}

/** 이름–값 목록 */
export function InfoList({ items }: { items: { label: string; value: ReactNode }[] }) {
  return (
    <dl className="grid grid-cols-1 gap-x-8 gap-y-3 rounded-xl bg-surface p-5 shadow-elevation-1 sm:grid-cols-2 lg:grid-cols-3">
      {items.map((item) => (
        <div key={item.label} className="flex min-w-0 flex-col gap-0.5">
          <dt className="text-caption text-tertiary">{item.label}</dt>
          <dd className="text-body-m break-all text-primary">{item.value}</dd>
        </div>
      ))}
    </dl>
  )
}

/** 화면 안에 그대로 보여 줄 실패 문구(서버 문구 + 문의용 요청 ID) */
export function ErrorText({ error }: { error: unknown }) {
  if (error == null) return null
  const message = isApiError(error) ? error.message : '처리하지 못했어요. 잠시 후 다시 시도해 주세요'
  const requestId = isApiError(error) ? error.requestId : undefined
  return (
    <p role="alert" className="text-body-s text-error">
      {message}
      {requestId && <span className="ml-2 font-mono text-caption text-tertiary">({requestId.slice(0, 8)})</span>}
    </p>
  )
}

/** 표가 비었을 때 한 줄 */
export function EmptyRow({ colSpan, label }: { colSpan: number; label: string }) {
  return (
    <tr>
      <td colSpan={colSpan} className="px-4 py-8 text-center text-body-s text-tertiary">
        {label}
      </td>
    </tr>
  )
}

export function StatusTag({ status }: { status: AdminUserStatus }) {
  return status === 'DELETION_REQUESTED' ? <Tag type="warning" size="s" label="탈퇴 요청" /> : <Tag type="pending" size="s" label="활성" />
}
