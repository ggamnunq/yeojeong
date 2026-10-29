// 환율 소스 단위 테스트 픽스처(실제 응답을 줄인 것). src/fx/*.spec.ts가 쓴다.

/** 2026-10-29 00:02:31 UTC */
export const ER_API_UPDATED_UNIX = 1793232151;

/** 실제 응답(open.er-api.com/v6/latest/USD, 2026-10-29)을 줄인 것 */
export const ER_API_FIXTURE = {
  result: 'success',
  provider: 'https://www.exchangerate-api.com',
  documentation: 'https://www.exchangerate-api.com/docs/free',
  terms_of_use: 'https://www.exchangerate-api.com/terms',
  time_last_update_unix: ER_API_UPDATED_UNIX,
  time_last_update_utc: 'Thu, 29 Oct 2026 00:02:31 +0000',
  time_next_update_unix: 1793318861,
  time_eol_unix: 0,
  base_code: 'USD',
  rates: {
    USD: 1,
    AED: 3.6725,
    AUD: 1.419838,
    CAD: 1.401824,
    CHF: 0.82903,
    CNH: 6.662397,
    CNY: 6.680538,
    EUR: 0.897215,
    GBP: 0.751538,
    HKD: 7.845294,
    IDR: 18181.613355,
    JPY: 157.90537,
    KRW: 1340.24082,
    MYR: 4.077375,
    NZD: 1.778098,
    PHP: 63.997475,
    SGD: 1.28178,
    THB: 33.772095,
    TWD: 32.415976,
    VND: 25834.040863,
  },
};

/** 한국수출입은행 AP01 응답 한 줄(필드 일부) */
export const eximItem = (cur_unit: string, deal_bas_r: string, result = 1) => ({
  result,
  cur_unit,
  cur_nm: cur_unit,
  ttb: '0',
  tts: '0',
  deal_bas_r,
});

/** 한국수출입은행 AP01 실제 고시 통화 전부(2026-10, TWD·VND·PHP 없음) */
export const EXIM_FULL_FIXTURE = [
  eximItem('AED', '377.19'),
  eximItem('AUD', '945.12'),
  eximItem('BHD', '3,684.21'),
  eximItem('BND', '1,081.3'),
  eximItem('CAD', '988.77'),
  eximItem('CHF', '1,671.9'),
  eximItem('CNH', '190.25'),
  eximItem('DKK', '207.5'),
  eximItem('EUR', '1,495.3'),
  eximItem('GBP', '1,783.4'),
  eximItem('HKD', '176.66'),
  eximItem('IDR(100)', '8.72'),
  eximItem('JPY(100)', '919.2'),
  eximItem('KRW', '1'),
  eximItem('KWD', '4,512.3'),
  eximItem('MYR', '329.1'),
  eximItem('NOK', '133.2'),
  eximItem('NZD', '779.4'),
  eximItem('SAR', '369.33'),
  eximItem('SEK', '146.9'),
  eximItem('SGD', '1,045.6'),
  eximItem('THB', '39.71'),
  eximItem('USD', '1,385.5'),
];
