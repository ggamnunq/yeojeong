import { render, screen, waitFor, within } from '@testing-library/react'
import { MemoryRouter } from 'react-router'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { db } from '../../mocks/data'
import { renderApp } from '../../test/render'
import { consentDoc, LEGAL_DOCS, resolveLegalLink } from './docs'
import { LegalBody } from './markdown'
import { fillPlaceholders, parseLegal } from './parse'
import { LEGAL_DOCUMENT_VERSIONS, LEGAL_RELEASES } from '@yeojeong/shared'
import { effectiveAt, resolveLegalVersion, versionLinkLabel, versionNotice } from './versions'

/** 시계 고정(Date만). 시행일 전후 전환은 이 시각으로만 본다 — 실제 날짜와 무관 */
const fixClock = (when: Date) => {
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(when)
}
const kst = (date: string, time = '12:00:00') => new Date(`${date}T${time}+09:00`)
const plusDays = (date: string, days: number) => {
  const d = new Date(`${date}T00:00:00Z`)
  d.setUTCDate(d.getUTCDate() + days)
  return d.toISOString().slice(0, 10)
}
// 0.2 게시일(머지하는 날)은 docs/legal/releases.json → manifest. 기대값은 manifest로 계산한다
const MANIFEST = LEGAL_DOCUMENT_VERSIONS
const PUBLISHED_02 = LEGAL_RELEASES.find((r) => r.dir === 'v0.2')!.published
/** 모든 판이 시행된 뒤(가장 늦은 시행일 다음 날 낮) */
const ALL_IN_FORCE = kst(plusDays(Object.values(MANIFEST).flat().map((v) => v.effectiveDate).sort().at(-1)!, 1))
const latestOf = (file: string) => MANIFEST[file].at(-1)!
const metaLine = (v: { version: string; effectiveDate: string }) => `버전 ${v.version} · 시행일 ${v.effectiveDate}`

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
    expect(screen.getByText('버전 0.1 · 시행일 2026-11-01')).toBeTruthy()
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

  it('맨 주소: 서비스 주소는 앱 안 링크, 다른 https는 바깥 링크(뒤 문장부호는 빼고)', () => {
    render(
      <MemoryRouter>
        <LegalBody
          source={'고지(https://jinyeojeong.com/privacy/processors)에서 · https://jinyeojeong.com/privacy 에 · https://example.com/a. 끝 · `https://jinyeojeong.com/terms`'}
          resolveLink={resolveLegalLink}
        />
      </MemoryRouter>,
    )
    expect(screen.getByRole('link', { name: 'https://jinyeojeong.com/privacy/processors' }).getAttribute('href')).toBe(
      '/privacy/processors',
    )
    expect(screen.getByRole('link', { name: 'https://jinyeojeong.com/privacy' }).getAttribute('href')).toBe('/privacy')
    const external = screen.getByRole('link', { name: 'https://example.com/a' })
    expect(external.getAttribute('target')).toBe('_blank')
    // 코드 안의 주소는 링크로 만들지 않는다
    expect(screen.queryByRole('link', { name: 'https://jinyeojeong.com/terms' })).toBeNull()
  })

  it('표 칸의 <br>만 줄바꿈, 다른 태그는 글자로', () => {
    render(
      <MemoryRouter>
        <LegalBody source={'| 수탁자 | 업무 |\n|---|---|\n| Google LLC<br>googlekrsupport@google.com | <b>서버</b> |'} />
      </MemoryRouter>,
    )
    expect(document.body.textContent).not.toContain('<br>')
    expect(screen.getByText('googlekrsupport@google.com').className).toContain('block')
    expect(screen.getByText('<b>서버</b>')).toBeTruthy()
  })

  it('정식 발행본 머리 줄(버전 · 시행일)은 메타로 읽고 본문에 넣지 않는다', () => {
    const doc = parseLegal('# 「여정」 개인정보 처리방침\n\n버전 1.0 · 시행일 2026-10-30\n\n머리말입니다.\n\n## 제1조(목적)\n\n가')
    expect(doc).toMatchObject({
      version: '1.0',
      effectiveDate: '2026-10-30',
      intro: [{ kind: 'paragraph', text: '머리말입니다.' }],
    })
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
    expect(consentDoc('PRIVACY')).toBe('consent-collection')
    // 카드 승인내역 불러오기 = 카드 내역 조회 동의서(0.2 판에서 게시)
    expect(consentDoc('CARD_IMPORT')).toBe('consent-card-import')
    // 정식 전문이 없는 동의는 수집·이용 동의서로 보내지 않고 준비 중 안내로
    expect(consentDoc('MARKETING')).toBe('pending')
    expect(consentDoc('FIN_PRIVACY')).toBe('pending')
    expect(consentDoc('NOPE')).toBeNull()
    expect(consentDoc(undefined)).toBeNull()
  })

  it('docs/legal 파일 이름 링크(퍼센트 인코딩 포함)를 공개 주소로', () => {
    expect(resolveLegalLink('서비스%20이용약관.md')).toBe('/terms')
    expect(resolveLegalLink('개인정보%20처리위탁%20고지.md')).toBe('/privacy/processors')
    expect(resolveLegalLink('오픈소스%20및%20라이선스%20고지.md')).toBe('/oss')
    expect(resolveLegalLink('카드%20내역%20조회%20동의서.md')).toBe('/consents/CARD_IMPORT')
    // 초안 파일(판 폴더 밖)은 게시하지 않으므로 링크가 없다
    expect(resolveLegalLink('금융정보%20연동%20이용약관(부속약관).md#제3조')).toBeNull()
    expect(resolveLegalLink('/licenses')).toBe('/licenses')
    expect(resolveLegalLink('https://jinyeojeong.com/oss')).toBe('/oss')
    expect(resolveLegalLink('https://jinyeojeong.com')).toBe('/')
    expect(resolveLegalLink('https://jinyeojeong.com.evil.com/x')).toBeNull()
    expect(resolveLegalLink('//evil.com')).toBeNull()
  })

  it('게시 문서마다 판이 있고, 판 없는 안내 문서는 content/ 바로 아래에 있다', () => {
    const files = Object.keys(import.meta.glob('./content/**/*.md')).map((p) => p.replace('./content/', ''))
    for (const doc of Object.values(LEGAL_DOCS)) {
      if (doc.source === null) expect(files).toContain(doc.file)
      else expect(MANIFEST[doc.file]?.length, doc.file).toBeGreaterThan(0)
    }
  })

  it('판 목록(manifest)과 content/v<판> 파일이 같다: 머리 줄의 버전·시행일, 자리표시 없음', () => {
    const contents = import.meta.glob<string>('./content/**/*.md', { query: '?raw', import: 'default', eager: true })
    const versioned = Object.keys(contents).filter((p) => /^\.\/content\/v[^/]+\//.test(p))
    const listed = Object.values(MANIFEST).flat()
    expect(versioned.sort()).toEqual(listed.map((v) => `./content/${v.path}`).sort())
    for (const v of listed) {
      const text = contents[`./content/${v.path}`]
      expect(text, v.path).not.toContain('{{')
      expect(text, v.path).not.toContain('본문 준비 중')
      expect(parseLegal(text), v.path).toMatchObject({ version: v.version, effectiveDate: v.effectiveDate })
    }
    // 판 폴더는 게시일 순서, 문서의 판은 오래된 것부터
    for (const versions of Object.values(MANIFEST)) {
      expect(versions.map((v) => v.effectiveDate)).toEqual(versions.map((v) => v.effectiveDate).sort())
    }
    for (const doc of Object.values(LEGAL_DOCS).filter((d) => d.source === null)) {
      expect(contents[`./content/${doc.file}`], doc.file).not.toContain('{{')
    }
  })

  it('0.1 = 게시 당시 1.0(2026-10-30). 오픈소스 고지는 0.1 그대로', () => {
    for (const file of ['terms.md', 'privacy.md', 'consent-collection.md', 'processors.md', 'licenses.md']) {
      expect(MANIFEST[file][0], file).toMatchObject({ version: '0.1', effectiveDate: '2026-10-30', path: `v0.1/${file}` })
    }
    expect(MANIFEST['licenses.md'].map((v) => v.version)).toEqual(['0.1'])
  })
})

describe('판 고르기(versions.ts)', () => {
  const manifest = {
    'privacy.md': [
      { version: '0.1', effectiveDate: '2026-10-30', path: 'v0.1/privacy.md', sha256: '' },
      { version: '0.2', effectiveDate: '2026-11-06', path: 'v0.2/privacy.md', sha256: '' },
    ],
    'terms.md': [{ version: '0.1', effectiveDate: '2026-10-30', path: 'v0.1/terms.md', sha256: '' }],
    'same-day.md': [
      { version: '0.1', effectiveDate: '2026-10-30', path: 'v0.1/same-day.md', sha256: '' },
      { version: '0.2', effectiveDate: '2026-10-30', path: 'v0.2/same-day.md', sha256: '' },
    ],
  }
  const pick = (file: string, v: string | null, when: string) => resolveLegalVersion(file, v, new Date(`${when}+09:00`), manifest)

  it('시행일 0시(KST)에 현행이 0.1 → 0.2로 바뀐다', () => {
    expect(pick('privacy.md', null, '2026-11-05T23:59:59')?.shown).toMatchObject({ version: '0.1', status: 'current' })
    expect(pick('privacy.md', null, '2026-11-06T00:00:00')?.shown).toMatchObject({ version: '0.2', status: 'current' })
    expect(effectiveAt('2026-11-06').toISOString()).toBe('2026-11-05T15:00:00.000Z')
  })

  it('시행 전 ?v=0.2는 예정 버전, 시행 후 ?v=0.1은 이전 버전, 없는 v는 현행', () => {
    const before = pick('privacy.md', '0.2', '2026-10-30T12:00:00')!
    expect(before.shown).toMatchObject({ version: '0.2', status: 'upcoming', path: 'v0.2/privacy.md' })
    expect(before.current.version).toBe('0.1')
    expect(versionNotice(before.shown)).toBe('예정 버전 0.2이에요. 2026-11-06부터 적용돼요')
    expect(versionLinkLabel(before.shown, before.current)).toBe('예정 버전 · 0.2(11-06부터)')
    expect(versionLinkLabel(before.current, before.current)).toBe('현행 버전 · 0.1(2026-10-30 ~ 11-05)')

    const after = pick('privacy.md', '0.1', '2026-11-06T00:00:00')!
    expect(after.shown).toMatchObject({ version: '0.1', status: 'previous', lastDate: '2026-11-05' })
    expect(versionNotice(after.shown)).toBe('이전 버전 0.1이에요. 2026-10-30 ~ 2026-11-05에 적용됐어요')
    expect(versionLinkLabel(after.shown, after.current)).toBe('이전 버전 · 0.1(2026-10-30 ~ 11-05)')
    expect(versionLinkLabel(after.current, after.current)).toBe('현행 버전 · 0.2(2026-11-06부터)')

    // 정확히 같은 버전만 고른다(앞부분 비교 없음): 0.1-draft · 0. · 0.10은 0.1이 아니다
    for (const v of ['9.9', '', 'x', null, '0.1-draft', '0.', '0.10', ' 0.1']) {
      expect(pick('privacy.md', v, '2026-11-06T00:00:00')?.shown.version, String(v)).toBe('0.2')
    }
  })

  it('옛 표기 ?v=1.0 · ?v=1.1은 0.1 · 0.2로 연다(하위 호환)', () => {
    expect(pick('privacy.md', '1.0', '2026-11-07T00:00:00')?.shown).toMatchObject({ version: '0.1', status: 'previous' })
    expect(pick('privacy.md', '1.1', '2026-10-31T00:00:00')?.shown).toMatchObject({ version: '0.2', status: 'upcoming' })
  })

  it('개정하지 않은 문서는 판이 하나뿐이라 ?v=0.2도 0.1(현행), 판 없는 문서는 null', () => {
    const terms = pick('terms.md', '0.2', '2026-11-07T00:00:00')!
    expect(terms.versions.map((v) => v.version)).toEqual(['0.1'])
    expect(terms.shown).toMatchObject({ version: '0.1', status: 'current', lastDate: null })
    expect(pick('pending.md', null, '2026-11-07T00:00:00')).toBeNull()
  })

  it('같은 날 바뀐 판: 뒤 판이 현행, 앞 판 기간은 그날 하루', () => {
    const r = pick('same-day.md', '0.1', '2026-10-30T12:00:00')!
    expect(r.current.version).toBe('0.2')
    expect(r.shown).toMatchObject({ version: '0.1', status: 'previous', lastDate: '2026-10-30' })
    expect(versionLinkLabel(r.shown, r.current)).toBe('이전 버전 · 0.1(2026-10-30 ~ 10-30)')
  })
})

describe('공개 법적 페이지', () => {
  // 모든 판이 시행된 뒤로 고정 — 실제 날짜가 지나도 결과가 같다
  beforeEach(() => fixClock(ALL_IN_FORCE))
  afterEach(() => vi.useRealTimers())

  it.each([
    ['/terms', '서비스 이용약관', 'terms.md'],
    ['/privacy', '개인정보처리방침', 'privacy.md'],
    ['/privacy/processors', '개인정보 처리위탁', 'processors.md'],
    ['/consents/PRIVACY', '개인정보 수집·이용', 'consent-collection.md'],
    ['/consents/TOS', '서비스 이용약관', 'terms.md'],
    ['/consents/CARD_IMPORT', '카드 승인내역 불러오기', 'consent-card-import.md'],
    ['/oss', '오픈소스 라이선스', 'licenses.md'],
    ['/terms/fin-link', '금융정보 연동 약관', null],
    ['/consents/THIRD_PARTY', '공동 결제 그룹 공개', null],
    ['/consents/FIN_PRIVACY', '금융정보 수집·이용', null],
  ])('%s는 로그인 없이 현행 판으로 열린다', async (url, title, file) => {
    db.session = 'ANONYMOUS'
    const { router } = renderApp(url)
    expect(await screen.findByRole('heading', { level: 1, name: title })).toBeTruthy()
    await waitFor(() => expect(document.querySelector('[data-legal-body]')).toBeTruthy())
    if (file) expect(screen.getByText(metaLine(latestOf(file)))).toBeTruthy()
    else expect(screen.getByText(/해당 기능을 정식으로 제공할 때 게시합니다/)).toBeTruthy()
    expect(document.body.textContent).not.toContain('{{')
    expect(router.state.location.pathname).toBe(url)
    // 판이 여럿이면 이전 판 링크(현행 주소 + ?v=), 하나면 다른 버전 목록이 없다
    const versions = file ? MANIFEST[file] : []
    if (versions.length > 1) {
      const previous = versions.at(-2)!
      const link = screen.getByRole('link', { name: new RegExp(`^이전 버전 · ${previous.version.replace('.', '\\.')}\\(${previous.effectiveDate} ~ `) })
      expect(link.getAttribute('href')).toBe(`${url}?v=${previous.version}`)
    } else expect(screen.queryByRole('navigation', { name: '다른 버전' })).toBeNull()
    expect(screen.queryByRole('button', { name: /예정 버전|이전 버전/ })).toBeNull()
  })

  it('처리방침의 처리위탁 고지 주소를 누르면 앱 안에서 연다', async () => {
    db.session = 'ANONYMOUS'
    const { router } = renderApp('/privacy')
    const link = await screen.findByRole('link', { name: 'https://jinyeojeong.com/privacy/processors' })
    expect(link.getAttribute('href')).toBe('/privacy/processors')
    link.click()
    expect(await screen.findByRole('heading', { level: 1, name: '개인정보 처리위탁' })).toBeTruthy()
    expect(router.state.location.pathname).toBe('/privacy/processors')
  })

  it('예전 주소 /licenses는 /oss로 보낸다', async () => {
    db.session = 'ANONYMOUS'
    const { router } = renderApp('/licenses')
    expect(await screen.findByRole('heading', { level: 1, name: '오픈소스 라이선스' })).toBeTruthy()
    expect(router.state.location.pathname).toBe('/oss')
  })

  it('약관의 오픈소스 고지 주소(/oss)도 앱 안 링크다', async () => {
    db.session = 'ANONYMOUS'
    renderApp('/terms')
    const link = await screen.findByRole('link', { name: 'https://jinyeojeong.com/oss' })
    expect(link.getAttribute('href')).toBe('/oss')
  })

  it('모르는 동의 ID는 찾을 수 없음 화면', async () => {
    renderApp('/consents/NOPE')
    expect(await screen.findByText('페이지를 찾을 수 없어요')).toBeTruthy()
  })

  it('?v=0.1은 이전 버전(안내 + 현행 링크) · 옛 표기 ?v=1.0도 같은 판 · 없는 v와 판이 하나인 문서의 ?v=0.2는 현행', async () => {
    db.session = 'ANONYMOUS'
    const current = latestOf('privacy.md')
    for (const v of ['0.1', '1.0']) {
      const view = renderApp(`/privacy?v=${v}`)
      expect(await screen.findByText(metaLine(MANIFEST['privacy.md'][0]))).toBeTruthy()
      expect(screen.getByRole('button', { name: /^이전 버전 0\.1이에요\. 2026-10-30 ~ / })).toBeTruthy()
      expect(screen.getByRole('link', { name: new RegExp(`^현행 버전 · ${current.version.replace('.', '\\.')}\\(`) }).getAttribute('href')).toBe(
        '/privacy',
      )
      view.unmount()
    }
    for (const [url, meta] of [
      ['/privacy?v=9.9', metaLine(current)],
      ['/oss?v=0.2', metaLine(latestOf('licenses.md'))],
    ] as const) {
      const view = renderApp(url)
      expect(await screen.findByText(meta)).toBeTruthy()
      expect(screen.queryByRole('button', { name: /예정 버전|이전 버전/ })).toBeNull()
      view.unmount()
    }
  })

  const terms02 = MANIFEST['terms.md'].find((v) => v.version === '0.2')
  it.runIf(terms02 && terms02.effectiveDate > PUBLISHED_02)(
    '이용약관 0.2 시행 전(게시일): /terms는 0.1 + "예정 버전 · 0.2(MM-DD부터) ›" → ?v=0.2 예정본(안내) → 현행으로',
    async () => {
      fixClock(kst(PUBLISHED_02))
      db.session = 'ANONYMOUS'
      const { router } = renderApp('/terms')
      expect(await screen.findByText(metaLine(MANIFEST['terms.md'][0]))).toBeTruthy()
      const link = screen.getByRole('link', { name: `예정 버전 · 0.2(${terms02!.effectiveDate.slice(5)}부터)` })
      expect(link.getAttribute('href')).toBe('/terms?v=0.2')
      link.click()
      expect(await screen.findByText(metaLine(terms02!))).toBeTruthy()
      expect(router.state.location.search).toBe('?v=0.2')
      // 개정 공지(이용약관이 바뀌어요)로 온 화면: 같은 판에서 함께 바뀐 문서(처리방침 정정·카드 불러오기 안내)
      const companions = screen.getByRole('region', { name: '함께 바뀐 문서' })
      expect(within(companions).getByText('개인정보처리방침을 바로잡고 카드 불러오기 안내를 더했어요')).toBeTruthy()
      expect(within(companions).getByRole('link', { name: `개인정보처리방침 0.2(${PUBLISHED_02}부터)` }).getAttribute('href')).toBe(
        '/privacy?v=0.2',
      )
      expect(within(companions).getByRole('link', { name: `카드 승인내역 불러오기 0.1(${PUBLISHED_02}부터)` }).getAttribute('href')).toBe(
        '/consents/CARD_IMPORT?v=0.1',
      )
      const notice = screen.getByRole('button', { name: new RegExp(`^예정 버전 0\\.2이에요\\. ${terms02!.effectiveDate}부터 적용돼요`) })
      notice.click()
      expect(await screen.findByText(metaLine(MANIFEST['terms.md'][0]))).toBeTruthy()
      expect(router.state.location.search).toBe('')
    },
  )

  const privacy03 = MANIFEST['privacy.md'].find((v) => v.version === '0.3')
  it.runIf(privacy03)('처리방침 0.3: 시행 전에는 0.2 현행 + "예정 버전 · 0.3(11-07부터)", 시행 뒤에는 0.3 현행 + 이전 0.2·0.1', async () => {
    const [v01, v02] = MANIFEST['privacy.md']
    db.session = 'ANONYMOUS'
    fixClock(kst(privacy03!.effectiveDate, '00:00:00'))
    vi.setSystemTime(new Date(kst(privacy03!.effectiveDate, '00:00:00').getTime() - 1000))
    const before = renderApp('/privacy')
    expect(await screen.findByText(metaLine(v02))).toBeTruthy()
    expect(screen.getByRole('link', { name: `예정 버전 · 0.3(${privacy03!.effectiveDate.slice(5)}부터)` }).getAttribute('href')).toBe(
      '/privacy?v=0.3',
    )
    before.unmount()
    const preview = renderApp('/privacy?v=0.3')
    expect(await screen.findByText(metaLine(privacy03!))).toBeTruthy()
    expect(screen.getByRole('button', { name: new RegExp(`^예정 버전 0\\.3이에요\\. ${privacy03!.effectiveDate}부터 적용돼요`) })).toBeTruthy()
    preview.unmount()

    vi.setSystemTime(kst(privacy03!.effectiveDate, '00:00:00'))
    renderApp('/privacy')
    expect(await screen.findByText(metaLine(privacy03!))).toBeTruthy()
    expect(screen.getByRole('link', { name: `이전 버전 · 0.2(${v02.effectiveDate} ~ ${plusDays(privacy03!.effectiveDate, -1).slice(5)})` }).getAttribute('href')).toBe(
      '/privacy?v=0.2',
    )
    expect(screen.getByRole('link', { name: new RegExp(`^이전 버전 · 0\\.1\\(${v01.effectiveDate} ~ `) }).getAttribute('href')).toBe('/privacy?v=0.1')
  })
})
