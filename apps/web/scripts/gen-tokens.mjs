// design-tokens/tokens.json(Figma DS v1.4) → src/styles/tokens.css (Tailwind 4 @theme)
//   node scripts/gen-tokens.mjs            docs/design에 원본이 있으면 복사해 온 뒤 생성
//   node scripts/gen-tokens.mjs --check    생성 결과가 커밋된 파일과 다르면 실패 (CI)
import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, relative, resolve } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const webRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..')

export const paths = {
  tokens: resolve(webRoot, 'design-tokens/tokens.json'),
  out: resolve(webRoot, 'src/styles/tokens.css'),
  designSource: resolve(webRoot, '../../docs/design/design-system/tokens.json'),
}

// Figma 역할 토큰 그룹 중 Tailwind 유틸 접두사와 겹치는 것은 짧은 이름도 만든다 (bg/canvas → bg-canvas)
const SHORT_ALIAS = { bg: 'background-color', text: 'text-color', border: 'border-color' }

const slug = (name) =>
  name
    .replace(/^Heading\//, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')

const px = (n) => (n === 0 ? '0' : `${n}px`)
const comment = (text) => `/* ${String(text).replaceAll('*/', '* /')} */`

// tokens.json의 typography는 Figma 서체 이름만 갖는다. CSS 변수 이름과 폴백 스택은 코드 쪽 결정이라 여기 둔다.
// 순서 = --font-* 출력 순서. Noto Sans KR은 가변 폰트(@fontsource-variable)를 먼저 찾는다.
const SYSTEM_FALLBACK = ['system-ui', '-apple-system', 'Apple SD Gothic Neo', 'Malgun Gothic', 'sans-serif']
export const FONT_FAMILIES = {
  'Noto Sans KR': { name: 'sans', stack: ['Noto Sans KR Variable', 'Noto Sans KR', ...SYSTEM_FALLBACK] },
  // 금액(Amount/*). tabular-nums는 index.css의 font-amount 유틸이 켠다.
  'IBM Plex Sans KR': { name: 'amount', stack: ['IBM Plex Sans KR', 'Noto Sans KR Variable', ...SYSTEM_FALLBACK] },
}

function hexToRgb(hex) {
  const m = /^#([0-9a-f]{6})$/i.exec(hex)
  if (!m) throw new Error(`hex 색이 아님: ${hex}`)
  const v = parseInt(m[1], 16)
  return [(v >> 16) & 255, (v >> 8) & 255, v & 255]
}

const rgba = (hex, alpha) => `rgb(${hexToRgb(hex).join(' ')} / ${alpha})`

function paletteLookup(palette, ref) {
  const [group, step] = ref.split('/')
  const hex = palette[group]?.[step]
  if (!hex) throw new Error(`팔레트에 없는 참조: ${ref}`)
  return hex
}

const paletteVar = (ref) => `var(--color-${ref.replace('/', '-')})`

/** hex → 팔레트 참조(group/step). 없으면 null. 팔레트 안에 같은 hex가 둘이면 어느 쪽인지 알 수 없어 실패한다. */
function paletteRefOf(palette, hex) {
  const refs = []
  for (const [group, steps] of Object.entries(palette)) {
    for (const [step, value] of Object.entries(steps)) {
      if (value.toLowerCase() === hex.toLowerCase()) refs.push(`${group}/${step}`)
    }
  }
  if (refs.length > 1) throw new Error(`팔레트에 같은 색이 여럿이라 참조를 정할 수 없음: ${hex} (${refs.join(', ')})`)
  return refs[0] ?? null
}

// 그림자 색: 불투명이면 팔레트 변수, 반투명이면 rgb(r g b / a)
function shadowColor(palette, { color, alpha }) {
  if (alpha !== 1) return rgba(color, alpha)
  const ref = paletteRefOf(palette, color)
  return ref ? paletteVar(ref) : color.toLowerCase()
}

function requireKeys(tokens) {
  for (const key of ['palette', 'roles', 'size', 'typography', 'elevation']) {
    if (!tokens[key]) throw new Error(`tokens.json에 ${key}가 없다. DS v1.4 이상의 tokens.json이 필요하다.`)
  }
}

export function generate(tokens) {
  requireKeys(tokens)
  const { palette, roles, size, typography, elevation, meta } = tokens
  const rules = tokens.typography_rules ?? {}
  const lines = []
  const out = (s = '') => lines.push(s)

  const source = meta?.version ? ` (DS v${meta.version} · ${meta.updated})` : ''
  out(`/* 자동 생성 파일 — 직접 고치지 말 것. 원본: apps/web/design-tokens/tokens.json${source}`)
  out(' * 다시 만들기: pnpm --filter @yeojeong/web ds:tokens')
  const space = Object.entries(size.space)
    .filter(([, v]) => v > 0)
    .map(([k, v]) => `space/${k}=${v / 4}`)
    .join(' ')
  out(` * 간격(space/N)은 Tailwind 기본 4px 스케일을 쓴다: ${space} */`)
  out()
  out('@theme static {')

  out('  --color-*: initial;')
  for (const [group, steps] of Object.entries(palette)) {
    for (const [step, hex] of Object.entries(steps)) {
      out(`  --color-${group}-${step}: ${hex.toLowerCase()};`)
    }
  }
  out()

  for (const role of roles) {
    let value
    if (role.ref) {
      const hex = paletteLookup(palette, role.ref)
      if (hex.toLowerCase() !== role.hex.toLowerCase()) {
        throw new Error(`${role.name}: hex ${role.hex}가 참조 ${role.ref}(${hex})와 다름`)
      }
      value = role.alpha == null ? paletteVar(role.ref) : rgba(hex, role.alpha)
    } else {
      value = role.alpha == null ? role.hex.toLowerCase() : rgba(role.hex, role.alpha)
    }
    out(`  --color-${slug(role.name)}: ${value}; ${comment(role.desc)}`)
  }
  out()

  out('  --radius-*: initial;')
  for (const [name, value] of Object.entries(size.radius)) out(`  --radius-${name}: ${px(value)};`)
  out()

  out('  --shadow-*: initial;')
  for (const [name, shadows] of Object.entries(elevation)) {
    const layers = shadows.map((s) => `${px(s.x)} ${px(s.y)} ${px(s.blur)} ${px(s.spread)} ${shadowColor(palette, s)}`)
    out(`  --shadow-${slug(name)}: ${layers.join(', ')};`)
  }
  out()

  for (const [name, value] of Object.entries(size.layout)) out(`  --spacing-${name}: ${px(value)};`)
  out()

  const used = new Set(Object.values(typography).map((t) => t.fontFamily))
  for (const [figmaName, { name, stack }] of Object.entries(FONT_FAMILIES)) {
    if (!used.has(figmaName)) continue
    const list = stack.map((f) => (/^[a-z-]+$/.test(f) ? f : `'${f}'`)).join(', ')
    out(`  --font-${name}: ${list};`)
  }
  out()

  for (const [key, rule] of Object.entries(rules)) {
    if (!typography[key]) out(`  ${comment(`${key}: ${rule}`)}`)
  }
  out('  --text-*: initial;')
  for (const [name, t] of Object.entries(typography)) {
    const family = FONT_FAMILIES[t.fontFamily]
    if (!family) throw new Error(`${name}: 서체 ${t.fontFamily}의 CSS 스택이 없다. gen-tokens.mjs의 FONT_FAMILIES에 추가할 것.`)
    if (t.tabularNums && family.name !== 'amount') {
      throw new Error(`${name}: tabularNums는 font-amount(IBM Plex Sans KR)에서만 켜진다.`)
    }
    const key = `--text-${slug(name)}`
    const rule = rules[name] ? ` ${comment(rules[name])}` : ''
    out(`  ${key}: ${px(t.fontSize)};${rule}`)
    out(`  ${key}--line-height: ${px(t.lineHeight)};`)
    out(`  ${key}--letter-spacing: ${px(t.letterSpacing)};`)
    out(`  ${key}--font-weight: ${t.fontWeight};`)
  }
  out('}')
  out()

  out('@theme inline {')
  for (const role of roles) {
    const [group, ...rest] = role.name.split('/')
    const ns = SHORT_ALIAS[group]
    if (ns) out(`  --${ns}-${slug(rest.join('/'))}: var(--color-${slug(role.name)});`)
  }
  out('}')

  return lines.join('\n') + '\n'
}

const readJson = (file) => JSON.parse(readFileSync(file, 'utf8'))

function main(argv) {
  const check = argv.includes('--check')
  const rel = (p) => relative(process.cwd(), p)

  if (existsSync(paths.designSource)) {
    const source = readFileSync(paths.designSource, 'utf8')
    if (source !== readFileSync(paths.tokens, 'utf8')) {
      if (check) {
        console.error(`${rel(paths.designSource)}가 ${rel(paths.tokens)}와 다르다. ds:tokens로 다시 생성할 것.`)
        process.exit(1)
      }
      writeFileSync(paths.tokens, source)
      console.log(`복사: ${rel(paths.designSource)} → ${rel(paths.tokens)}`)
    }
  }

  const css = generate(readJson(paths.tokens))
  const current = existsSync(paths.out) ? readFileSync(paths.out, 'utf8') : ''

  if (check) {
    if (css !== current) {
      console.error(`${rel(paths.out)}가 design-tokens와 맞지 않는다. pnpm --filter @yeojeong/web ds:tokens 실행 후 커밋할 것.`)
      process.exit(1)
    }
    console.log(`${rel(paths.out)} 최신 상태`)
    return
  }
  if (css !== current) writeFileSync(paths.out, css)
  console.log(`${css === current ? '변경 없음' : '생성'}: ${rel(paths.out)}`)
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) main(process.argv.slice(2))
