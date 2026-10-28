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

// Figma Slot/Screen(24:61191) 자리표시자 — 셸 카탈로그에서 Content 슬롯 자리를 보여 줄 때
export function SlotScreen() {
  return (
    <div className="flex flex-1 items-center justify-center text-caption text-tertiary">
      Content 슬롯 — 390 × (App 646 · Sub 710 · Onboarding 622)
    </div>
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
