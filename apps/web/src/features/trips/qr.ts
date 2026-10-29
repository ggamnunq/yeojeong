import encodeQR from 'qr'

// 초대 QR(W8) 행렬·SVG path. 라이브러리 qr(paulmillr, MIT, 의존성 없음)로 클라이언트에서 만든다 — 링크가 서버·외부로 나가지 않는다.

/** QR 그림 안 여백(모듈 수). 둘레 흰 타일 패딩 17px(약 3모듈)과 합쳐 표준 권장 4모듈 이상(Figma Code/QR 139:16468) */
const QUIET_ZONE = 2

/** 어두운 모듈을 가로로 이어 붙인 SVG path(모듈 1 = 1 user unit). 순수 함수라 테스트한다 */
export function qrPath(matrix: readonly (readonly boolean[])[]): string {
  let d = ''
  matrix.forEach((row, y) => {
    let x = 0
    while (x < row.length) {
      if (!row[x]) {
        x += 1
        continue
      }
      const start = x
      while (x < row.length && row[x]) x += 1
      d += `M${start} ${y}h${x - start}v1h${start - x}z`
    }
  })
  return d
}

/** 문자열 → 모듈 행렬(여백 포함). 오류 정정 M(약 15%) — 화면 밝기·흠집에 충분하고 모듈이 너무 작아지지 않는다 */
export function qrMatrix(value: string): boolean[][] {
  return encodeQR(value, 'raw', { ecc: 'medium', border: QUIET_ZONE })
}
