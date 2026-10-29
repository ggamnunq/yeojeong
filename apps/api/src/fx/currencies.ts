// 통화 표시 정보(기능명세 4-5 "표시", 화면명세 0-5 "환율"). 고시 단위는 은행 고시 관례(JPY·IDR·VND = 100)를 따른다.
// 장소 목록(shared places.ts, 기능명세 7-4)이 생기면 그쪽 currencyNameKo·displayUnit과 맞춘다.

export const KRW = 'KRW';

export interface CurrencyMeta {
  code: string;
  /** 화면 표기 "100엔 = 919.20원"의 "엔" */
  nameKo: string;
  /** 고시 단위 */
  displayUnit: number;
}

const CURRENCIES: Record<string, Omit<CurrencyMeta, 'code'>> = {
  KRW: { nameKo: '원', displayUnit: 1 },
  JPY: { nameKo: '엔', displayUnit: 100 },
  USD: { nameKo: '달러', displayUnit: 1 },
  EUR: { nameKo: '유로', displayUnit: 1 },
  GBP: { nameKo: '파운드', displayUnit: 1 },
  CNY: { nameKo: '위안', displayUnit: 1 },
  TWD: { nameKo: '대만 달러', displayUnit: 1 },
  HKD: { nameKo: '홍콩 달러', displayUnit: 1 },
  SGD: { nameKo: '싱가포르 달러', displayUnit: 1 },
  AUD: { nameKo: '호주 달러', displayUnit: 1 },
  NZD: { nameKo: '뉴질랜드 달러', displayUnit: 1 },
  CAD: { nameKo: '캐나다 달러', displayUnit: 1 },
  CHF: { nameKo: '스위스 프랑', displayUnit: 1 },
  THB: { nameKo: '바트', displayUnit: 1 },
  VND: { nameKo: '동', displayUnit: 100 },
  IDR: { nameKo: '루피아', displayUnit: 100 },
  PHP: { nameKo: '페소', displayUnit: 1 },
  MYR: { nameKo: '링깃', displayUnit: 1 },
};

/** 여정 통화로 고를 수 있는 통화(표 순서 그대로, KRW가 맨 앞). 화면 목록은 src/trips/currencies.ts */
export const SUPPORTED_CURRENCY_CODES: readonly string[] =
  Object.keys(CURRENCIES);

/** 환율 수집 잡이 진행 중 여정 통화와 함께 늘 모으는 통화 */
export const DEFAULT_FX_CURRENCIES: readonly string[] = Object.keys(
  CURRENCIES,
).filter((code) => code !== KRW);

/** 모르는 통화는 코드 그대로, 고시 단위 1 */
export function currencyMeta(code: string): CurrencyMeta {
  const upper = code.toUpperCase();
  const known = CURRENCIES[upper];
  return known
    ? { code: upper, ...known }
    : { code: upper, nameKo: upper, displayUnit: 1 };
}
