// docs/legal(로컬 전용 원문) → src/features/legal/content 복사. 법적 문서 본문을 레포에 커밋하기로 정한 뒤에만 쓴다.
// 사용: pnpm --filter @yeojeong/web legal:sync
import { copyFileSync, existsSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const here = dirname(fileURLToPath(import.meta.url))
const from = join(here, '../../../docs/legal')
const to = join(here, '../src/features/legal/content')

// src/features/legal/docs.ts의 file ↔ source와 같게 둔다
const FILES = {
  'terms.md': '서비스 이용약관.md',
  'privacy.md': '개인정보처리방침.md',
  'fin-link.md': '금융정보 연동 이용약관(부속약관).md',
  'licenses.md': '오픈소스 및 라이선스 고지.md',
  'consent-collection.md': '개인정보 수집·이용 동의서.md',
  'consent-third-party.md': '개인정보 제3자 제공 동의서.md',
}

if (!existsSync(from)) {
  console.error(`docs/legal이 없다: ${from}`)
  process.exit(1)
}
for (const [file, source] of Object.entries(FILES)) {
  copyFileSync(join(from, source), join(to, file))
  console.log(`${source} → content/${file}`)
}
