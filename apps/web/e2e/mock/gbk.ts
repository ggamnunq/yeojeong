// 테스트용 GBK 인코더: Node TextDecoder('gbk')로 2바이트 표를 거꾸로 만든다(의존성 없음). 알리페이 CSV처럼 GBK 파일을 만들 때 쓴다.
let table: Map<string, [number, number]> | null = null

function reverseTable() {
  if (table) return table
  table = new Map()
  const decoder = new TextDecoder('gbk', { fatal: true })
  for (let hi = 0x81; hi <= 0xfe; hi++) {
    for (let lo = 0x40; lo <= 0xfe; lo++) {
      if (lo === 0x7f) continue
      try {
        const ch = decoder.decode(new Uint8Array([hi, lo]))
        if (ch.length === 1 && !table.has(ch)) table.set(ch, [hi, lo])
      } catch {
        // 빈 자리
      }
    }
  }
  return table
}

/** 문자열 → GBK 바이트. ASCII는 그대로, GBK에 없는 글자는 실패 */
export default function gbk(text: string): Buffer {
  const map = reverseTable()
  const out: number[] = []
  for (const ch of text) {
    const code = ch.codePointAt(0) ?? 0
    if (code < 0x80) out.push(code)
    else {
      const bytes = map.get(ch)
      if (!bytes) throw new Error(`GBK에 없는 글자: ${ch}`)
      out.push(...bytes)
    }
  }
  return Buffer.from(out)
}
