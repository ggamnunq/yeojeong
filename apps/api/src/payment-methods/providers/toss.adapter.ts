import {
  PaymentProviderAdapter,
  ProviderError,
  type ProviderPaymentMethod,
  type ProviderTokens,
  type TransactionPage,
} from './payment-provider.adapter.js';

/**
 * 실제 토스 연동 자리. 제휴 형태·API 범위가 확정되지 않아(미결 Q-03 ①~⑧) 인터페이스만 맞춰 두었다.
 * 모든 호출이 UNAVAILABLE을 던지므로 PAYMENT_PROVIDER=toss로 띄우면 연결 시작이 503 PROVIDER_UNAVAILABLE이 된다.
 *
 * 구현할 때 지킬 것(payment-provider.adapter.ts 머리말):
 * - 카드·계좌 번호는 masking.ts로 마스킹해서 넘기고, ref가 실번호면 TokenCipher.hmacRef로 바꾼다
 * - 적요의 송금 상대방 이름은 merchantName·raw에서 지운다, 입금은 넘기지 않는다
 * - 401/토큰 만료 → AUTH_EXPIRED, 동의 철회 → CONSENT_REVOKED, 429 → RATE_LIMITED, 5xx·타임아웃 → UNAVAILABLE
 * - client secret은 Secret Manager(env TOSS_CLIENT_ID·TOSS_CLIENT_SECRET)에서 받는다
 */
export class TossPaymentAdapter extends PaymentProviderAdapter {
  readonly provider = 'TOSS' as const;

  buildAuthorizeUrl(): string {
    throw new ProviderError('UNAVAILABLE', 'toss adapter is not implemented');
  }

  exchangeCode(): Promise<ProviderTokens> {
    return Promise.reject(new ProviderError('UNAVAILABLE'));
  }

  refreshTokens(): Promise<ProviderTokens> {
    return Promise.reject(new ProviderError('UNAVAILABLE'));
  }

  listPaymentMethods(): Promise<ProviderPaymentMethod[]> {
    return Promise.reject(new ProviderError('UNAVAILABLE'));
  }

  listTransactions(): Promise<TransactionPage> {
    return Promise.reject(new ProviderError('UNAVAILABLE'));
  }

  revoke(): Promise<void> {
    return Promise.reject(new ProviderError('UNAVAILABLE'));
  }
}
