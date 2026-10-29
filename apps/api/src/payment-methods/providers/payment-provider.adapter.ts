import type { PaymentMethodType, Provider, TxKind } from '@yeojeong/shared';

// 금융 데이터 제공자 경계(기능명세 7-2). 서버는 이 인터페이스에만 의존하고
// 토스 구현(TossPaymentAdapter, 계약 전이라 미구현)과 개발·시연용 DemoTossAdapter를 env로 바꿔 끼운다.
//
// 어댑터가 지키는 것(I-9, 8-1·8-2):
// - 카드·계좌 전체 번호를 넘기지 않는다. maskedNumber는 어댑터가 마스킹한 값이고, ref가 실번호면 HMAC으로 바꿔 넘긴다.
// - 계좌 거래 적요의 송금 상대방 이름 같은 제3자 정보는 merchantName·raw 모두에서 뺀다(→ "계좌 이체").
// - 입금(받은 돈)은 넘기지 않는다. kind는 결제(APPROVAL)와 그 취소·환불(CANCEL)뿐이다.
// - 토큰과 거래 내용을 로그에 남기지 않는다.

export interface ProviderTokens {
  accessToken: string;
  refreshToken?: string;
  expiresAt?: Date;
  /** 동의 범위(제공자 값 그대로) */
  scope?: string;
}

/**
 * 인증 시작 때 서버가 넘기는 참고 정보. 실제 제공자에게는 보내지 않는다.
 * DEMO 어댑터가 샘플 페르소나(준용·민지·태현·수빈)를 고르는 데만 쓴다.
 */
export interface AuthorizeHint {
  userId: string;
  nickname?: string;
}

export interface ProviderPaymentMethod {
  /** 제공자의 불투명 ID(실번호면 HMAC). PaymentMethod.externalRef */
  ref: string;
  type: PaymentMethodType;
  /** "토스뱅크" */
  institutionName: string;
  /** "토스뱅크 체크카드" */
  productName: string;
  /** 없으면 서버가 정한다(은행 체크카드 → "{은행} 체크카드", 카드사 카드 → 카드사명, 계좌 → "{은행} 통장") */
  shortLabel?: string;
  /** 어댑터가 마스킹한 값(masking.ts). 카드 "**** **** **** 1934"(끝 4자리만), 계좌 "3333-**-****821"(앞 4·끝 3) */
  maskedNumber: string;
  /** 체크카드가 출금하는 계좌의 ref(같은 사용자 중복 제거, 4-1-3) */
  linkedAccountRef?: string;
}

export interface ProviderTransaction {
  /** 제공자 거래 ID. (paymentMethodId, externalRef) 멱등 upsert 키 */
  ref: string;
  kind: TxKind;
  occurredAt: Date;
  /** 가맹점명. 계좌 이체·송금의 상대방 이름은 담지 않는다 */
  merchantName: string;
  /** 원통화 금액 decimal 문자열. 부호는 서버가 kind로 정한다(취소는 음수로 저장) */
  amount: string;
  /** ISO 4217 */
  currency: string;
  /** 제공자가 준 원화(국내 결제, 체크카드 원화 출금 등) */
  krwAmount?: number;
  /** 카드사 청구(매입) 확정 원화 */
  billedKrwAmount?: number;
  billedAt?: Date;
  /** 취소가 가리키는 원 승인 ref(제공자가 줄 때, 미결 Q-03 ④) */
  approvalRef?: string;
  /** 원문. 서버가 AES-256-GCM으로 암호화해 90일 보존한다 */
  raw: unknown;
}

export interface TransactionPage {
  items: ProviderTransaction[];
  /** 다음 페이지. 없으면 끝 */
  nextCursor?: string;
}

export type ProviderErrorCode =
  /** 토큰 만료 → 갱신 1회 시도 후 실패면 연결 EXPIRED */
  | 'AUTH_EXPIRED'
  /** 사용자가 제공자 쪽에서 동의를 철회 → 연결 EXPIRED */
  | 'CONSENT_REVOKED'
  /** 인증 코드 교환 실패(콜백) → 502 PROVIDER_AUTH_FAILED */
  | 'AUTH_FAILED'
  /** 호출 한도 → 다음 주기 재시도 */
  | 'RATE_LIMITED'
  /** 제공자 장애 → 다음 주기 재시도 */
  | 'UNAVAILABLE'
  /** 잘못된 요청 → 그 결제수단만 건너뜀 */
  | 'INVALID_REQUEST';

/** 어댑터가 던지는 오류. message에 토큰·거래 내용을 넣지 않는다 */
export class ProviderError extends Error {
  constructor(
    readonly code: ProviderErrorCode,
    message?: string,
  ) {
    super(message ?? `provider error: ${code}`);
    this.name = 'ProviderError';
  }
}

/**
 * 제공자 어댑터. Nest DI 토큰을 겸하려고 abstract class로 둔다(PaymentProvidersModule이 env로 구현을 고른다).
 * 1) 인증 시작 → 2) 콜백(코드 교환) → 3) 결제수단 목록 → 4) 거래 조회(증분) → 5) 연결 해제
 */
export abstract class PaymentProviderAdapter {
  /** PaymentConnection.provider에 저장되는 값 */
  abstract readonly provider: Provider;

  /** 1) 외부 인증 화면 주소. state는 서버가 만든 난수(해시만 저장), redirectUri는 콜백 주소 */
  abstract buildAuthorizeUrl(input: {
    state: string;
    redirectUri: string;
    hint: AuthorizeHint;
  }): string;

  /** 2) 콜백의 인증 코드 → 토큰. 실패하면 ProviderError('AUTH_FAILED') */
  abstract exchangeCode(input: {
    code: string;
    redirectUri: string;
  }): Promise<ProviderTokens>;

  /** 토큰 갱신. 실패하면 ProviderError('AUTH_EXPIRED' | 'CONSENT_REVOKED') */
  abstract refreshTokens(tokens: ProviderTokens): Promise<ProviderTokens>;

  /** 3) 연결할 수 있는 계좌·카드(마스킹 값만) */
  abstract listPaymentMethods(
    tokens: ProviderTokens,
  ): Promise<ProviderPaymentMethod[]>;

  /** 4) 결제수단 하나의 [from, to] 거래. cursor로 다음 페이지를 이어 받는다 */
  abstract listTransactions(
    tokens: ProviderTokens,
    input: { methodRef: string; from: Date; to: Date; cursor?: string },
  ): Promise<TransactionPage>;

  /** 5) 제공자 쪽 토큰 폐기(연결 해제·마지막 결제수단 해제) */
  abstract revoke(tokens: ProviderTokens): Promise<void>;
}
