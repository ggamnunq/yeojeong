import type { FileImportProvider } from '@yeojeong/shared'

// 파일 공급자별 화면 정보(HF-66 내보내는 방법 · 오류 문구). 알리페이는 여기에 한 항목을 더한다(파서는 parsers/index.ts).

/** HF-66 번호 단계 한 줄: 한국어 조각과 중국어 메뉴명(zh — 괄호·보조색) + 아래 보조 줄(note, Caption) */
export type GuideStep = { parts: ({ text: string } | { zh: string })[]; note?: string }

export interface ProviderInfo {
  provider: FileImportProvider
  /** 주소 조각(/wallet/file-import/:slug) */
  slug: string
  /** 화면 이름(결과 헤더 "위챗페이 · N건") */
  name: string
  /** 헤더 제목·진입 행(HF-65) */
  title: string
  /** HF-66 번호 단계(Figma Row/Step 164:17086) */
  steps: GuideStep[]
  /** HF-66b 보조 줄 · HF-66c 보조 줄 */
  formatSub: string
  archiveSub: string
  /** input accept */
  accept: string
}

export const PROVIDERS: Record<FileImportProvider, ProviderInfo> = {
  WECHAT: {
    provider: 'WECHAT',
    slug: 'wechat',
    name: '위챗페이',
    title: '위챗페이 파일 가져오기',
    steps: [
      { parts: [{ text: '위챗에서 나' }, { zh: '我' }, { text: ' → 서비스' }, { zh: '服务' }, { text: ' → 지갑' }, { zh: '钱包' }] },
      { parts: [{ text: '내역' }, { zh: '账单' }, { text: ' → 오른쪽 위 ⋯ → 내역 다운로드' }, { zh: '下载账单' }] },
      { parts: [{ text: '개인 대사용' }, { zh: '用于个人对账' }, { text: ' 선택 · 기간 최대 1년' }] },
      { parts: [{ text: '받기: 위챗 공식 계정 메시지 또는 이메일' }], note: '이메일은 압축 비밀번호가 위챗페이(微信支付) 공식 계정으로 와요' },
      { parts: [{ text: '받은 xlsx 파일(압축은 풀어서)을 여기에 올려요' }] },
    ],
    formatSub: '用于个人对账로 받은 xlsx 파일을 올려 주세요',
    archiveSub: '비밀번호는 위챗페이(微信支付) 공식 계정 메시지에 있어요',
    // 현재 위챗 형식은 xlsx, 예전 CSV도 읽는다
    accept: '.xlsx,.csv',
  },
}

export const providerBySlug = (slug: string | undefined): ProviderInfo | null =>
  Object.values(PROVIDERS).find((p) => p.slug === slug) ?? null
