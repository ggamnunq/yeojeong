import { clsx } from 'clsx'
import type { ReactNode } from 'react'

export function Row({ children, className }: { children: ReactNode; className?: string }) {
  return <div className={clsx('flex flex-wrap items-start gap-6', className)}>{children}</div>
}

export function Variant({ name, children, className }: { name: string; children: ReactNode; className?: string }) {
  return (
    <figure className={clsx('flex flex-col gap-2', className)}>
      <div className="flex min-h-9 items-center">{children}</div>
      <figcaption className="text-caption text-tertiary">{name}</figcaption>
    </figure>
  )
}

export function Sub({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="flex flex-col gap-4">
      <h3 className="text-body-s-strong text-secondary">{title}</h3>
      {children}
    </section>
  )
}
