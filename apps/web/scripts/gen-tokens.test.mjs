import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { generate, paths } from './gen-tokens.mjs'

const tokens = JSON.parse(readFileSync(paths.tokens, 'utf8'))
const styles = JSON.parse(readFileSync(paths.styles, 'utf8'))

describe('gen-tokens', () => {
  it('출력 스냅샷', () => {
    expect(generate(tokens, styles)).toMatchSnapshot()
  })

  it('같은 입력이면 같은 출력', () => {
    expect(generate(tokens, styles)).toBe(generate(structuredClone(tokens), structuredClone(styles)))
  })

  it('커밋된 tokens.css와 같다', () => {
    expect(readFileSync(paths.out, 'utf8')).toBe(generate(tokens, styles))
  })

  it('역할 토큰은 팔레트를 참조하고, alpha는 rgb/alpha로 바꾼다', () => {
    const css = generate(tokens, styles)
    expect(css).toContain('--color-bg-canvas: var(--color-neutral-50);')
    expect(css).toContain('--color-expense-pending-dot: var(--color-warning-500);')
    expect(css).toContain('--color-bg-dim: rgb(20 20 30 / 0.48);')
    expect(css).toContain('--shadow-focus-ring: 0 0 0 3px var(--color-primary-200);')
    expect(css).toContain('--text-body-m: 15px;')
    expect(css).toContain('--text-body-m--letter-spacing: -0.15px;')
    expect(css).toContain('--background-color-canvas: var(--color-bg-canvas);')
  })

  it('역할 토큰 hex가 참조 팔레트와 다르면 실패한다', () => {
    const broken = structuredClone(tokens)
    broken.roles[0].hex = '#000000'
    expect(() => generate(broken, styles)).toThrow(/bg\/canvas/)
  })
})
