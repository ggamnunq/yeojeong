import type { FileImportProvider } from '@yeojeong/shared'

// 파일 공급자별 화면 정보(HF-66 내보내는 방법 · 오류 문구 · 제외 안내). 공급자를 더할 때 여기와 파서(parsers/index.ts)에 한 항목씩 더한다.

/**
 * HF-66 번호 단계 한 줄: 한국어 조각과 중국어 메뉴명(zh — 괄호·보조색) + 아래 보조 줄(note, Caption).
 * zh의 before는 메뉴명과 한 덩어리로 줄바꿈 없이 붙는 앞 글자("→ 내역 다운로드") — 줄이 넘치면 덩어리째 다음 줄로 간다(Figma "⋯" 뒤 줄바꿈)
 */
export type GuideStep = { parts: ({ text: string } | { zh: string; before?: string })[]; note?: string }

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
  /** HF-68 제외 안내(사람 사이 거래 개수) */
  excludedTransfer: (n: number) => string
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
      { parts: [{ text: '내역' }, { zh: '账单' }, { text: ' → 오른쪽 위 ⋯ ' }, { before: '→ 내역 다운로드', zh: '下载账单' }] },
      { parts: [{ text: '개인 대사용' }, { zh: '用于个人对账' }, { text: ' 선택 · 기간 최대 1년' }] },
      { parts: [{ text: '받기: 위챗 공식 계정 메시지 또는 이메일' }], note: '이메일은 압축 비밀번호가 위챗페이(微信支付) 공식 계정으로 와요' },
      { parts: [{ text: '받은 xlsx 파일(압축은 풀어서)을 여기에 올려요' }] },
    ],
    formatSub: '用于个人对账로 받은 xlsx 파일을 올려 주세요',
    archiveSub: '비밀번호는 위챗페이(微信支付) 공식 계정 메시지에 있어요',
    excludedTransfer: (n) => `송금·홍바오 ${n}건은 제외했어요`,
    // 현재 위챗 형식은 xlsx, 예전 CSV도 읽는다
    accept: '.xlsx,.csv',
  },
  // HF-66a 알리페이 안내(W11, Figma 176:18199). 개인 대조용 파일은 이메일 zip(암호)으로 오고, 풀면 CSV다
  ALIPAY: {
    provider: 'ALIPAY',
    slug: 'alipay',
    name: '알리페이',
    title: '알리페이 파일 가져오기',
    steps: [
      { parts: [{ text: '알리페이에서 내 정보' }, { zh: '我的' }, { text: ' → 내역' }, { zh: '账单' }] },
      // HF-66a: "⋯" 뒤에서 줄이 바뀐다("→ 거래 내역 증명 발급(开具交易流水证明)"이 한 덩어리)
      { parts: [{ text: '오른쪽 위 ⋯ ' }, { before: '→ 거래 내역 증명 발급', zh: '开具交易流水证明' }] },
      { parts: [{ text: '개인 대사용' }, { zh: '用于个人对账' }, { text: ' 선택 · 기간 최대 1년' }] },
      { parts: [{ text: '이메일로 받기' }], note: '압축 비밀번호는 앱의 발급 기록(开具记录)에서 확인해요' },
      { parts: [{ text: '받은 CSV 파일(압축은 풀어서)을 여기에 올려요' }] },
    ],
    formatSub: '用于个人对账로 받은 CSV 파일을 올려 주세요',
    archiveSub: '비밀번호는 알리페이 앱의 발급 기록(开具记录)에 있어요',
    // 송금·이체·红包만 센다(충전·余额宝·신용 상환 등 중성 거래는 조용히 뺀다)
    excludedTransfer: (n) => `송금·이체 ${n}건은 제외했어요`,
    // 압축(zip)도 고를 수 있게 둔다 — 고르면 "압축을 풀고 올려 주세요"(HF-66c)로 안내한다. Excel로 다시 저장한 xlsx도 읽는다
    accept: '.csv,.zip,.xlsx',
  },
}

export const providerBySlug = (slug: string | undefined): ProviderInfo | null =>
  Object.values(PROVIDERS).find((p) => p.slug === slug) ?? null
