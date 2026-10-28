import { render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router'
import { describe, expect, it } from 'vitest'
import { db } from '../../mocks/data'
import { renderApp } from '../../test/render'
import { consentDoc, LEGAL_DOCS, resolveLegalLink } from './docs'
import { Markdown } from './markdown'
import { parseMarkdown } from './parse'

describe('parseMarkdown', () => {
  it('제목 · 인용 · 구분선 · 표 · 목록 · 문단', () => {
    const blocks = parseMarkdown(
      [
        '# 약관',
        '> 상태: 초안',
        '> 두 번째 줄',
        '---',
        '## 제1조(목적)',
        '이 약관은',
        '목적으로 합니다.',
        '',
        '1. 첫째',
        '   가. 세부',
        '- 점',
        '',
        '| 항목 | 기간 |',
        '|---|---|',
        '| 회원 정보 | 탈퇴 시 |',
      ].join('\n'),
    )
    expect(blocks.map((b) => b.kind)).toEqual(['heading', 'quote', 'rule', 'heading', 'paragraph', 'list', 'table'])
    expect(blocks[1]).toEqual({ kind: 'quote', lines: ['상태: 초안', '두 번째 줄'] })
    expect(blocks[4]).toEqual({ kind: 'paragraph', text: '이 약관은 목적으로 합니다.' })
    expect(blocks[5]).toEqual({
      kind: 'list',
      items: [
        { depth: 0, text: '1. 첫째' },
        { depth: 1, text: '가. 세부' },
        { depth: 0, text: '- 점' },
      ],
    })
    expect(blocks[6]).toEqual({ kind: 'table', head: ['항목', '기간'], rows: [['회원 정보', '탈퇴 시']] })
  })

  it('HTML은 해석하지 않고 글자로 그린다 · 굵게 · 코드 · 링크', () => {
    render(
      <MemoryRouter>
        <Markdown
          source={'<script>x</script> **중요** `TOS` [처리방침](개인정보처리방침.md) [외부](https://example.com) [모름](x.md)'}
          resolveLink={resolveLegalLink}
        />
      </MemoryRouter>,
    )
    expect(document.querySelector('script')).toBeNull()
    expect(screen.getByText(/<script>x<\/script>/)).toBeTruthy()
    expect(screen.getByText('중요').tagName).toBe('STRONG')
    expect(screen.getByText('TOS').tagName).toBe('CODE')
    expect(screen.getByRole('link', { name: '처리방침' }).getAttribute('href')).toBe('/privacy')
    expect(screen.getByRole('link', { name: '외부' }).getAttribute('rel')).toBe('noreferrer')
    expect(screen.queryByRole('link', { name: '모름' })).toBeNull()
  })
})

describe('문서 표', () => {
  it('동의 ID → 전문 문서, 모르는 ID는 null', () => {
    expect(consentDoc('THIRD_PARTY')).toBe('consent-third-party')
    expect(consentDoc('AGE14')).toBe('terms')
    expect(consentDoc('NOPE')).toBeNull()
    expect(consentDoc(undefined)).toBeNull()
  })

  it('docs/legal 파일 이름 링크(퍼센트 인코딩 포함)를 공개 주소로', () => {
    expect(resolveLegalLink('서비스%20이용약관.md')).toBe('/terms')
    expect(resolveLegalLink('금융정보%20연동%20이용약관(부속약관).md#제3조')).toBe('/terms/fin-link')
    expect(resolveLegalLink('/licenses')).toBe('/licenses')
    expect(resolveLegalLink('//evil.com')).toBeNull()
  })

  it('content/에 문서 파일이 모두 있다', () => {
    const files = Object.keys(import.meta.glob('./content/*.md')).map((p) => p.replace('./content/', ''))
    for (const doc of Object.values(LEGAL_DOCS)) expect(files).toContain(doc.file)
  })
})

describe('공개 법적 페이지', () => {
  it.each([
    ['/terms', '서비스 이용약관'],
    ['/privacy', '개인정보처리방침'],
    ['/terms/fin-link', '금융정보 연동 약관'],
    ['/licenses', '오픈소스 라이선스'],
    ['/consents/THIRD_PARTY', '공동 결제 그룹 공개'],
    ['/consents/FIN_PRIVACY', '금융정보 수집·이용'],
  ])('%s는 로그인 없이 열린다', async (url, title) => {
    db.session = 'ANONYMOUS'
    const { router } = renderApp(url)
    expect(await screen.findByRole('heading', { level: 1, name: title })).toBeTruthy()
    await waitFor(() => expect(document.querySelector('blockquote')).toBeTruthy())
    expect(router.state.location.pathname).toBe(url)
  })

  it('모르는 동의 ID는 찾을 수 없음 화면', async () => {
    renderApp('/consents/NOPE')
    expect(await screen.findByText('페이지를 찾을 수 없어요')).toBeTruthy()
  })
})
