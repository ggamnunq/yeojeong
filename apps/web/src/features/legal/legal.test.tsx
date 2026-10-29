import { render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router'
import { describe, expect, it } from 'vitest'
import { db } from '../../mocks/data'
import { renderApp } from '../../test/render'
import { consentDoc, LEGAL_DOCS, resolveLegalLink } from './docs'
import { LegalBody } from './markdown'
import { fillPlaceholders, parseLegal } from './parse'

const SAMPLE = [
  '# 「여정」 서비스 이용약관',
  '',
  '> 문서 상태: 초안 v0.1 · 작성 2026-10-28 · 시행일 2026-11-01 · 법률 검토 전',
  '> 동의 ID `TOS` (필수). 게시 전에 `{{...}}`를 채운다.',
  '',
  '---',
  '',
  '## 제1장 총칙',
  '',
  '### 제1조(목적)',
  '',
  '이 약관은',
  '목적으로 합니다. [검토]',
  '',
  '### 제2조(용어의 정의)',
  '',
  '① 용어의 뜻은 다음과 같습니다.',
  '',
  '1. "서비스"란 서비스를 말합니다.',
  '2. 결제의 뜻은 다음과 같습니다.',
  '   가. 미확정 결제',
  '   나. 공동 결제',
  '',
  '② 그 밖의 용어는 법령에 따릅니다.',
  '',
  '> [검토] 검토자 메모',
  '',
  '## 제2장 이용계약',
  '',
  '### 제3조(이용계약의 성립)',
  '',
  '- 점',
  '',
  '| 항목 | 기간 |',
  '|---|---|',
  '| 회원 정보 | **탈퇴 시** |',
  '',
  '## 3. 검토 메모 (게시하지 않음)',
  '',
  '### 3-1. 숨김',
  '',
  '숨겨야 하는 문단',
  '',
  '## 부칙',
  '',
  '제1조(시행일) 이 약관은 시행합니다.',
].join('\n')

describe('parseLegal', () => {
  const doc = parseLegal(SAMPLE)

  it('제목 · 머리 인용의 시행일·버전(본문에는 넣지 않는다)', () => {
    expect(doc.title).toBe('「여정」 서비스 이용약관')
    expect(doc.effectiveDate).toBe('2026-11-01')
    expect(doc.version).toBe('0.1')
    expect(doc.intro).toEqual([])
  })

  it('시행일이 아직 플레이스홀더면 null', () => {
    expect(parseLegal('# 약관\n\n> 시행일 {{시행일}}\n\n본문 준비 중')).toMatchObject({
      effectiveDate: null,
      intro: [{ kind: 'paragraph', text: '본문 준비 중' }],
    })
  })

  it('장 → 조 트리, 앵커 id', () => {
    expect(doc.sections.map((s) => [s.kind, s.id, s.heading])).toEqual([
      ['chapter', 'chapter-1', '제1장 총칙'],
      ['chapter', 'chapter-2', '제2장 이용계약'],
      ['section', 'part-1', '부칙'],
    ])
    expect(doc.sections[0].sections.map((s) => [s.kind, s.id])).toEqual([
      ['article', 'article-1'],
      ['article', 'article-2'],
    ])
  })

  it('항(①) 안에 호(1.) · 목(가.)이 중첩되고, [검토] 표시·줄은 빠진다', () => {
    const [purpose, terms] = doc.sections[0].sections
    expect(purpose.blocks).toEqual([{ kind: 'paragraph', text: '이 약관은 목적으로 합니다.' }])
    expect(terms.blocks).toEqual([
      {
        kind: 'clause',
        marker: '①',
        text: '용어의 뜻은 다음과 같습니다.',
        blocks: [
          {
            kind: 'list',
            ordered: true,
            items: [
              { marker: '1.', text: '"서비스"란 서비스를 말합니다.', children: [] },
              {
                marker: '2.',
                text: '결제의 뜻은 다음과 같습니다.',
                children: [
                  { marker: '가.', text: '미확정 결제', children: [] },
                  { marker: '나.', text: '공동 결제', children: [] },
                ],
              },
            ],
          },
        ],
      },
      { kind: 'clause', marker: '②', text: '그 밖의 용어는 법령에 따릅니다.', blocks: [] },
    ])
  })

  it('"게시하지 않음" 절은 하위 절까지 통째로 빠진다', () => {
    expect(JSON.stringify(doc)).not.toMatch(/검토|숨김|숨겨야/)
  })

  it('글머리 목록 · 표', () => {
    const [article] = doc.sections[1].sections
    expect(article.blocks).toEqual([
      { kind: 'list', ordered: false, items: [{ marker: null, text: '점', children: [] }] },
      { kind: 'table', head: ['항목', '기간'], rows: [['회원 정보', '**탈퇴 시**']] },
    ])
  })

  it('번호가 겹치는 조는 앵커에 순번을 붙인다', () => {
    const twice = parseLegal('## 제1조(목적)\n\n가\n\n## 제1조(시행일)\n\n나')
    expect(twice.sections.map((s) => s.id)).toEqual(['article-1', 'article-1-2'])
  })
})

describe('자리표시자(QA HF-30)', () => {
  it('정해진 값은 채우고, 정해지지 않은 {{…}}는 화면에 남기지 않는다', () => {
    expect(fillPlaceholders('{{사업자명}}(이하 "회사")', { 사업자명: '여정 주식회사' })).toBe('여정 주식회사(이하 "회사")')
    expect(fillPlaceholders('문의: {{고객센터 운영시간}} 운영', {})).toBe('문의: 운영')
  })

  it('본문 어디에도 {{가 그려지지 않는다', () => {
    render(
      <MemoryRouter>
        <LegalBody source={'# 약관\n\n> 시행일 {{시행일}}\n\n## 제1조(목적)\n\n{{사업자명}}이 정합니다.'} resolveLink={resolveLegalLink} />
      </MemoryRouter>,
    )
    expect(document.body.textContent).not.toContain('{{')
  })
})

describe('LegalBody', () => {
  it('제목(h1)은 그리지 않고 장 h2 · 조 h3(앵커 id), 시행일 한 줄', () => {
    render(
      <MemoryRouter>
        <LegalBody source={SAMPLE} />
      </MemoryRouter>,
    )
    expect(screen.queryByText('「여정」 서비스 이용약관')).toBeNull()
    expect(screen.queryByText(/문서 상태/)).toBeNull()
    expect(screen.getByText('시행일 2026-11-01')).toBeTruthy()
    expect(screen.getByRole('heading', { level: 2, name: '제1장 총칙' })).toBeTruthy()
    const article = screen.getByRole('heading', { level: 3, name: '제2조(용어의 정의)' })
    expect(article.closest('section')?.id).toBe('article-2')
    expect(screen.getByRole('region', { name: '제2조(용어의 정의)' })).toBeTruthy()
    expect(screen.getByText('미확정 결제')).toBeTruthy()
    expect(screen.queryByText(/검토자 메모|숨겨야/)).toBeNull()
  })

  it('동의서는 굵게 표시를 크기·굵기·색으로 강조한다', () => {
    const { container, rerender } = render(
      <MemoryRouter>
        <LegalBody source={SAMPLE} emphasis="consent" />
      </MemoryRouter>,
    )
    expect(screen.getByText('탈퇴 시').tagName).toBe('STRONG')
    const body = () => container.querySelector('[data-legal-body]')!.className
    expect(body()).toContain('[&_strong]:text-body-l-strong')
    rerender(
      <MemoryRouter>
        <LegalBody source={SAMPLE} />
      </MemoryRouter>,
    )
    expect(body()).not.toContain('[&_strong]:text-body-l-strong')
  })

  it('HTML은 해석하지 않고 글자로 그린다 · 굵게 · 코드 · 링크', () => {
    render(
      <MemoryRouter>
        <LegalBody
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

  it('details·summary·코드 블록은 글자로', () => {
    render(
      <MemoryRouter>
        <LegalBody source={'## 4-3. 라이선스 전문\n\n<details>\n<summary>MIT License</summary>\n\n```\nMIT License\n<b>x</b>\n```\n\n</details>'} />
      </MemoryRouter>,
    )
    expect(document.querySelector('details, b')).toBeNull()
    expect(screen.getByText('MIT License', { selector: 'strong' })).toBeTruthy()
    expect(screen.getByText(/<b>x<\/b>/, { selector: 'pre' })).toBeTruthy()
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
    await waitFor(() => expect(document.querySelector('[data-legal-body]')).toBeTruthy())
    // 플레이스홀더 본문: 머리 인용(시행일 미정)은 그리지 않는다
    expect(document.querySelector('blockquote')).toBeNull()
    expect(router.state.location.pathname).toBe(url)
  })

  it('모르는 동의 ID는 찾을 수 없음 화면', async () => {
    renderApp('/consents/NOPE')
    expect(await screen.findByText('페이지를 찾을 수 없어요')).toBeTruthy()
  })
})
