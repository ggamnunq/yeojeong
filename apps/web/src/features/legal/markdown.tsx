import { clsx } from 'clsx'
import type { ReactNode } from 'react'
import { Link } from 'react-router'

import { parseMarkdown } from './parse'

// parse.ts 블록을 그린다. 글 안은 **굵게** · `코드` · [링크](주소)만. HTML은 React가 글자로 그린다.

export type LinkResolver = (href: string) => string | null

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
      if (internal) out.push(<Link key={key} to={internal} className="text-brand underline">{label}</Link>)
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

const HEADING = {
  1: 'text-h2 text-primary',
  2: 'mt-8 text-h3 text-primary',
  3: 'mt-6 text-body-m-strong text-primary',
  4: 'mt-4 text-body-s-strong text-primary',
} as const

const INDENT = ['', 'pl-4', 'pl-8']

export function Markdown({ source, resolveLink }: { source: string; resolveLink?: LinkResolver }) {
  const inline = (text: string) => renderInline(text, resolveLink)
  return (
    <div className="flex flex-col gap-3 pb-10 text-body-s text-secondary [&_code]:font-amount [&_strong]:font-semibold [&_strong]:text-primary">
      {parseMarkdown(source).map((block, i) => {
        switch (block.kind) {
          case 'heading': {
            // 화면 h1은 헤더 문서명이라 한 단계씩 내린다
            const Tag = (['h2', 'h3', 'h4', 'h5'] as const)[block.level - 1]
            return (
              <Tag key={i} className={HEADING[block.level]}>
                {inline(block.text)}
              </Tag>
            )
          }
          case 'quote':
            return (
              <blockquote key={i} className="rounded-md bg-subtle px-4 py-3 text-caption text-tertiary">
                {block.lines.map((l, j) => (
                  <p key={j}>{inline(l)}</p>
                ))}
              </blockquote>
            )
          case 'rule':
            return <hr key={i} className="border-default" />
          case 'table':
            return (
              <div key={i} className="overflow-x-auto">
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
          case 'list':
            return (
              <ul key={i} className="flex flex-col gap-1.5">
                {block.items.map((item, j) => (
                  <li key={j} className={clsx(INDENT[item.depth])}>
                    {inline(item.text)}
                  </li>
                ))}
              </ul>
            )
          case 'paragraph':
            return <p key={i}>{inline(block.text)}</p>
        }
      })}
    </div>
  )
}
