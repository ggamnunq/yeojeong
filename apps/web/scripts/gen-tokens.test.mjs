import { readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { generate, paths } from './gen-tokens.mjs'

const tokens = JSON.parse(readFileSync(paths.tokens, 'utf8'))
const fixture = resolve(dirname(fileURLToPath(import.meta.url)), '__fixtures__/tokens-v1.3.css')

// CSS 선언(`--이름: 값;`)만 뽑는다. 주석은 비교하지 않는다.
const declarations = (css) =>
  new Map(
    css
      .split('\n')
      .map((line) => /^\s*(--[\w-]+(?:\*)?):\s*(.+?);/.exec(line))
      .filter(Boolean)
      .map(([, name, value]) => [name, value]),
  )

describe('gen-tokens', () => {
  it('출력 스냅샷', () => {
    expect(generate(tokens)).toMatchSnapshot()
  })

  it('같은 입력이면 같은 출력', () => {
    expect(generate(tokens)).toBe(generate(structuredClone(tokens)))
  })

  it('커밋된 tokens.css와 같다', () => {
    expect(readFileSync(paths.out, 'utf8')).toBe(generate(tokens))
  })

  // v1.3까지는 텍스트·이펙트 스타일을 design-tokens/styles.json에서 읽었다. v1.4 tokens.json(typography·elevation)으로
  // 원본을 옮긴 뒤에도 그때 만든 값이 하나도 바뀌지 않았는지 고정 사본(__fixtures__/tokens-v1.3.css)과 비교한다.
  it('v1.3 생성 결과의 선언이 이름·값 모두 그대로 남고, 새로 생긴 것은 Amount/XL뿐이다', () => {
    const before = declarations(readFileSync(fixture, 'utf8'))
    const after = declarations(generate(tokens))
    expect(before.size).toBeGreaterThan(200)
    for (const [name, value] of before) expect(after.get(name), name).toBe(value)
    const added = [...after.keys()].filter((name) => !before.has(name))
    expect(added).toEqual([
      '--text-amount-xl',
      '--text-amount-xl--line-height',
      '--text-amount-xl--letter-spacing',
      '--text-amount-xl--font-weight',
    ])
  })

  it('역할 토큰은 팔레트를 참조하고, alpha는 rgb/alpha로 바꾼다', () => {
    const css = generate(tokens)
    expect(css).toContain('--color-bg-canvas: var(--color-neutral-50);')
    expect(css).toContain('--color-expense-pending-dot: var(--color-warning-500);')
    expect(css).toContain('--color-bg-dim: rgb(20 20 30 / 0.48);')
    expect(css).toContain('--text-body-m: 15px;')
    expect(css).toContain('--text-body-m--letter-spacing: -0.15px;')
    expect(css).toContain('--background-color-canvas: var(--color-bg-canvas);')
  })

  it('elevation: 불투명 그림자 색은 팔레트 변수로, 반투명은 rgb/alpha로', () => {
    const css = generate(tokens)
    expect(css).toContain('--shadow-focus-ring: 0 0 0 3px var(--color-primary-200);')
    expect(css).toContain('--shadow-elevation-3: 0 12px 32px 0 rgb(20 20 30 / 0.16), 0 2px 8px 0 rgb(20 20 30 / 0.06);')
  })

  it('typography: Amount/XL(40/48, −1, 700)과 서체 스택', () => {
    const css = generate(tokens)
    expect(css).toContain('--text-amount-xl: 40px;')
    expect(css).toContain('--text-amount-xl--letter-spacing: -1px;')
    expect(css).toContain("--font-amount: 'IBM Plex Sans KR', 'Noto Sans KR Variable',")
    expect(css).toContain('원본: apps/web/design-tokens/tokens.json (DS v1.5 · 2026-10-28)')
  })

  it('typography_rules는 해당 스타일 옆 주석으로 남는다', () => {
    const line = generate(tokens)
      .split('\n')
      .find((l) => l.includes('--text-amount-xl:'))
    expect(line).toContain('/* 화면당 영웅 숫자 1개')
  })

  it('역할 토큰 hex가 참조 팔레트와 다르면 실패한다', () => {
    const broken = structuredClone(tokens)
    broken.roles[0].hex = '#000000'
    expect(() => generate(broken)).toThrow(/bg\/canvas/)
  })

  it('CSS 스택이 없는 서체, tabularNums가 켜진 본문 서체, v1.3 tokens.json은 실패한다', () => {
    const unknown = structuredClone(tokens)
    unknown.typography.Display.fontFamily = 'Pretendard'
    expect(() => generate(unknown)).toThrow(/Pretendard/)

    const tabular = structuredClone(tokens)
    tabular.typography.Caption.tabularNums = true
    expect(() => generate(tabular)).toThrow(/Caption/)

    const v13 = structuredClone(tokens)
    delete v13.typography
    delete v13.elevation
    expect(() => generate(v13)).toThrow(/typography/)
  })

  it('팔레트 밖 그림자 색은 hex 그대로 쓴다', () => {
    const custom = structuredClone(tokens)
    custom.elevation['Focus/Ring'][0].color = '#123456'
    expect(generate(custom)).toContain('--shadow-focus-ring: 0 0 0 3px #123456;')
  })
})
