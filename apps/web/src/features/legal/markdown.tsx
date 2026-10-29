import { clsx } from 'clsx'
import { useMemo, type ReactNode } from 'react'
import { Link } from 'react-router'

import { parseLegal, type LegalBlock, type LegalListItem, type LegalSection } from './parse'

// parse.ts 문서 트리를 그린다. 글 안은 **굵게** · `코드` · [링크](주소)만. HTML은 React가 글자로 그린다.

export type LinkResolver = (href: string) => string | null

/**
 * 굵게 표시 방식. consent = 동의서의 중요 내용(「개인정보 보호법」 제22조제2항): 본문보다 20% 이상 크게 + 굵게 + 진한 색.
 * default = 굵게 + 진한 색
 */
export type LegalEmphasis = 'consent' | 'default'

type Inline = (text: string) => ReactNode[]

/** 주소는 resolveLink가 앱 경로로 바꾸고, 못 바꾸면 http(s)만 바깥 링크, 나머지는 글자만 */
function renderInline(text: string, resolveLink: LinkResolver = () => null): ReactNode[] {
  const out: ReactNode[] = []
  const pattern = /\*\*(.+?)\*\*|`([^`]+)`|\[([^\]]+)\]\(([^)]+)\)/g
  let last = 0
  for (const match of text.matchAll(pattern)) {
    if (match.index > last) out.push(text.slice(last, match.index))
    const key = match.index
    if (match[1] !== undefined) out.push(<strong key={key}>{renderInline(match[1], resolveLink)}</strong>)
    else if (match[2] !== undefined) out.push(<code key={key}>{match[2]}</code>)
    else {
      const [label, href] = [match[3], match[4]]
      const internal = resolveLink(href)
      if (internal)
        out.push(
          <Link key={key} to={internal} className="text-brand underline">
            {label}
          </Link>,
        )
      else if (/^https?:\/\//.test(href))
        out.push(
          <a key={key} href={href} target="_blank" rel="noreferrer" className="text-brand underline">
            {label}
          </a>,
        )
      else out.push(label)
    }
    last = match.index + match[0].length
  }
  if (last < text.length) out.push(text.slice(last))
  return out
}

const EMPHASIS = {
  // Body/S 13 → Body/L 16(23% 크게)
  consent: '[&_strong]:text-body-l-strong [&_strong]:font-semibold [&_strong]:text-primary',
  default: '[&_strong]:font-semibold [&_strong]:text-primary',
} satisfies Record<LegalEmphasis, string>

export type LegalBodyProps = {
  source: string
  resolveLink?: LinkResolver
  emphasis?: LegalEmphasis
}

/** 법적 문서 본문: (시행일) → 머리말 → 장 · 조 · 절. 문서 제목은 화면 헤더가 보여 준다 */
export function LegalBody({ source, resolveLink, emphasis = 'default' }: LegalBodyProps) {
  const doc = useMemo(() => parseLegal(source), [source])
  const inline: Inline = (text) => renderInline(text, resolveLink)
  return (
    <div
      data-legal-body=""
      className={clsx(
        'flex flex-col gap-8 pb-10 text-body-s text-secondary [&_code]:font-amount',
        EMPHASIS[emphasis],
      )}
    >
      {(doc.effectiveDate || doc.intro.length > 0) && (
        <div className="flex flex-col gap-3">
          {doc.effectiveDate && <p className="text-caption text-tertiary">시행일 {doc.effectiveDate}</p>}
          <Blocks blocks={doc.intro} inline={inline} />
        </div>
      )}
      {doc.sections.map((section) => (
        <Section key={section.id} section={section} depth={0} inline={inline} />
      ))}
    </div>
  )
}

const HEADING_TAG = ['h2', 'h3', 'h4'] as const

function headingClass(section: LegalSection, depth: number) {
  if (section.kind === 'chapter') return 'text-h3 text-primary'
  return depth >= 2 ? 'text-body-s-strong text-primary' : 'text-body-m-strong text-primary'
}

function Section({ section, depth, inline }: { section: LegalSection; depth: number; inline: Inline }) {
  const Heading = HEADING_TAG[Math.min(depth, HEADING_TAG.length - 1)]
  const headingId = `${section.id}-title`
  return (
    <section
      id={section.id}
      aria-labelledby={headingId}
      className={clsx('flex scroll-mt-20 flex-col', section.kind === 'chapter' ? 'gap-6' : 'gap-3')}
    >
      <Heading id={headingId} className={headingClass(section, depth)}>
        {inline(section.heading)}
      </Heading>
      {section.blocks.length > 0 && (
        <div className="flex flex-col gap-3">
          <Blocks blocks={section.blocks} inline={inline} />
        </div>
      )}
      {section.sections.map((child) => (
        <Section key={child.id} section={child} depth={depth + 1} inline={inline} />
      ))}
    </section>
  )
}

function Blocks({ blocks, inline }: { blocks: readonly LegalBlock[]; inline: Inline }) {
  return blocks.map((block, i) => <Block key={i} block={block} inline={inline} />)
}

function Block({ block, inline }: { block: LegalBlock; inline: Inline }) {
  switch (block.kind) {
    case 'paragraph':
      return <p>{inline(block.text)}</p>
    case 'clause':
      return (
        <div className="flex flex-col gap-2">
          <p className="flex gap-1">
            <span className="shrink-0">{block.marker}</span>
            <span className="min-w-0">{inline(block.text)}</span>
          </p>
          {block.blocks.length > 0 && (
            <div className="flex flex-col gap-2 pl-4">
              <Blocks blocks={block.blocks} inline={inline} />
            </div>
          )}
        </div>
      )
    case 'list':
      return <List ordered={block.ordered} items={block.items} inline={inline} />
    case 'table':
      return (
        <div className="overflow-x-auto">
          <table className="w-full border-collapse text-caption">
            <thead>
              <tr>
                {block.head.map((c, j) => (
                  <th key={j} className="border border-default bg-subtle px-2 py-1.5 text-left font-semibold text-primary">
                    {inline(c)}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {block.rows.map((row, r) => (
                <tr key={r}>
                  {row.map((c, j) => (
                    <td key={j} className="border border-default px-2 py-1.5 align-top">
                      {inline(c)}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )
    case 'quote':
      return (
        <blockquote className="rounded-md bg-subtle px-4 py-3 text-caption text-tertiary">
          {block.lines.map((l, j) => (
            <p key={j}>{inline(l)}</p>
          ))}
        </blockquote>
      )
    case 'code':
      return (
        <pre className="overflow-x-auto rounded-md bg-subtle px-4 py-3 font-amount text-caption whitespace-pre text-secondary">
          {block.text}
        </pre>
      )
  }
}

/** 호(1.)·목(가.)은 번호를 글자로 그대로 보여 준다(조문 인용 "제2조제1항제3호"와 맞게). 글머리 기호는 점 */
function List({ ordered, items, inline }: { ordered: boolean; items: readonly LegalListItem[]; inline: Inline }) {
  const Tag = ordered ? 'ol' : 'ul'
  return (
    <Tag className="flex flex-col gap-1.5">
      {items.map((item, j) => (
        <li key={j} className="flex flex-col gap-1.5">
          <span className="flex gap-1.5">
            <span aria-hidden={item.marker === null || undefined} className={clsx('shrink-0', item.marker === null && 'text-tertiary')}>
              {item.marker ?? '·'}
            </span>
            <span className="min-w-0">{inline(item.text)}</span>
          </span>
          {item.children.length > 0 && (
            <div className="pl-4">
              <List ordered={item.children[0].marker !== null} items={item.children} inline={inline} />
            </div>
          )}
        </li>
      ))}
    </Tag>
  )
}
