import type { FileImportProvider } from '@yeojeong/shared';

/** 공급자별 거래 통화(위챗페이·알리페이 개인 대조용 내역은 금액이 늘 위안). 공급자를 더하면 여기에도 더한다 */
export const FILE_IMPORT_PROVIDER_CURRENCY: Record<FileImportProvider, string> =
  {
    WECHAT: 'CNY',
    ALIPAY: 'CNY',
  };

export const FILE_IMPORT_CURRENCIES = [
  ...new Set(Object.values(FILE_IMPORT_PROVIDER_CURRENCY)),
];
