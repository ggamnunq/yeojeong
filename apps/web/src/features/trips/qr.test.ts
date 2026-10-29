import decodeQR from 'qr/decode.js'
import { describe, expect, it } from 'vitest'
import { qrMatrix, qrPath } from './qr'

/** path("M{x} {y}h{n}v1h-{n}z" 반복) → 어두운 칸 집합 */
function cellsFromPath(d: string): Set<string> {
  const cells = new Set<string>()
  for (const [, x, y, n] of d.matchAll(/M(\d+) (\d+)h(\d+)v1h-\d+z/g)) {
    for (let i = 0; i < Number(n); i++) cells.add(`${Number(x) + i},${y}`)
  }
  return cells
}

/** 행렬 → RGBA 비트맵(모듈당 4px)으로 그려 실제 디코더로 읽는다 */
function decodeMatrix(matrix: boolean[][]): string {
  const scale = 4
  const size = matrix.length * scale
  const data = new Uint8Array(size * size * 4).fill(255)
  matrix.forEach((row, y) =>
    row.forEach((dark, x) => {
      if (!dark) return
      for (let dy = 0; dy < scale; dy++)
        for (let dx = 0; dx < scale; dx++) {
          const i = ((y * scale + dy) * size + x * scale + dx) * 4
          data[i] = data[i + 1] = data[i + 2] = 0
        }
    }),
  )
  return decodeQR({ width: size, height: size, data })
}

describe('초대 QR(W8)', () => {
  const url = 'https://jinyeojeong.com/join#code=K7M2QX'

  it('참여 링크를 그대로 담고, 실제 디코더로 다시 읽힌다(오류 정정 M · 여백 2모듈)', () => {
    const matrix = qrMatrix(url)
    expect(matrix.length).toBe(29 + 4)
    // 여백 2모듈은 모두 밝다
    expect(matrix[0].some(Boolean)).toBe(false)
    expect(matrix[1].some(Boolean)).toBe(false)
    expect(decodeMatrix(matrix)).toBe(url)
  })

  it('path는 어두운 모듈만 빠짐없이 가로로 이어 그린다', () => {
    const matrix = qrMatrix(url)
    const expected = new Set<string>()
    matrix.forEach((row, y) => row.forEach((dark, x) => dark && expected.add(`${x},${y}`)))
    expect(cellsFromPath(qrPath(matrix))).toEqual(expected)
    expect(qrPath([[true, true, false, true]])).toBe('M0 0h2v1h-2zM3 0h1v1h-1z')
    expect(qrPath([[false]])).toBe('')
  })
})
