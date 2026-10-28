import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import '../index.css'
import { Logo } from '../ds'
import type { CatalogEntry } from './catalog'

// 폴더에 *.catalog.tsx만 추가하면 자동으로 등록된다
const modules = import.meta.glob<CatalogEntry>(['../ds/**/*.catalog.tsx', './**/*.catalog.tsx'], {
  eager: true,
  import: 'default',
})

const GROUPS = { foundations: '파운데이션', components: '컴포넌트' } as const

const groupOrder = Object.keys(GROUPS)
const entries = Object.values(modules).sort(
  (a, b) =>
    groupOrder.indexOf(a.group) - groupOrder.indexOf(b.group) ||
    (a.order ?? 999) - (b.order ?? 999) ||
    a.title.localeCompare(b.title),
)

const slug = (title: string) => title.toLowerCase().replace(/[^a-z0-9]+/g, '-')

function Catalog() {
  return (
    <div className="mx-auto flex max-w-6xl gap-10 px-gutter py-10">
      <nav className="sticky top-10 hidden h-fit w-44 shrink-0 flex-col gap-6 md:flex">
        <Logo height={28} />
        {(Object.keys(GROUPS) as (keyof typeof GROUPS)[]).map((group) => (
          <div key={group} className="flex flex-col gap-1">
            <p className="text-caption text-tertiary">{GROUPS[group]}</p>
            {entries
              .filter((e) => e.group === group)
              .map((e) => (
                <a key={e.title} href={`#${slug(e.title)}`} className="text-body-s text-secondary hover:text-primary">
                  {e.title}
                </a>
              ))}
          </div>
        ))}
      </nav>
      <main className="flex min-w-0 flex-1 flex-col gap-12">
        {entries.map(({ title, figma, Demo }) => (
          <section key={title} id={slug(title)} data-catalog={title} className="flex flex-col gap-6">
            <header className="flex items-baseline gap-3 border-b border-default pb-3">
              <h2 className="text-h2">{title}</h2>
              {figma && <span className="text-caption text-tertiary">Figma {figma}</span>}
            </header>
            <Demo />
          </section>
        ))}
      </main>
    </div>
  )
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <Catalog />
  </StrictMode>,
)
