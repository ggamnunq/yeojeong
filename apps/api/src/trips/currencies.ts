import type { SupportedCurrency } from '@yeojeong/shared';
import {
  KRW,
  SUPPORTED_CURRENCY_CODES,
  currencyMeta,
} from '../fx/currencies.js';

// 여정 통화 고르기 목록(GET /api/currencies). 통화 표(고시 단위·단위 이름)는 fx/currencies.ts가 기준이고,
// 여기는 고르기 화면에 쓰는 "코드 · 한국어 이름"의 이름만 더한다. 표에 통화를 더하면 이름도 함께 더한다(단위 테스트가 확인).

export const CURRENCY_NAMES: Readonly<Record<string, string>> = {
  KRW: '대한민국 원',
  JPY: '일본 엔',
  USD: '미국 달러',
  EUR: '유로',
  GBP: '영국 파운드',
  CNY: '중국 위안',
  TWD: '대만 달러',
  HKD: '홍콩 달러',
  SGD: '싱가포르 달러',
  AUD: '호주 달러',
  NZD: '뉴질랜드 달러',
  CAD: '캐나다 달러',
  CHF: '스위스 프랑',
  THB: '태국 바트',
  VND: '베트남 동',
  IDR: '인도네시아 루피아',
  PHP: '필리핀 페소',
  MYR: '말레이시아 링깃',
};

/** KRW가 맨 앞, 나머지는 서버 고정 표 순서 */
export const TRIP_CURRENCY_CODES: readonly string[] = [
  KRW,
  ...SUPPORTED_CURRENCY_CODES.filter((code) => code !== KRW),
];

export const SUPPORTED_CURRENCIES: readonly SupportedCurrency[] =
  TRIP_CURRENCY_CODES.map((code) => {
    const meta = currencyMeta(code);
    return {
      code,
      name: CURRENCY_NAMES[code] ?? code,
      unitName: meta.nameKo,
      displayUnit: meta.displayUnit,
      fractionDigits: meta.fractionDigits,
    };
  });
