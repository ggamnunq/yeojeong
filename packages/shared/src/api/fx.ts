import type { FxPolicy, RateType } from '../domain.js';

// 환율 응답(기능명세 4-5, 5-8 FR-806~808, 6-3 "환율"). 환율은 문자열 decimal, 원화는 정수.

/** 한 통화의 매매기준율 고시 한 건 */
export interface FxRateView {
  /** 항상 KRW */
  baseCurrency: 'KRW';
  /** 환율을 본 통화(ISO 4217) */
  currency: string;
  /** "엔", "달러" */
  currencyNameKo: string;
  /** 고시 단위. JPY·IDR·VND = 100, 그 외 1 */
  displayUnit: number;
  /** 1단위당 원, 소수 여섯째 자리("9.192000") */
  rate: string;
  /** 고시 단위당 원, 소수 둘째 자리 반올림("919.20"). 천 단위 쉼표 없음 */
  displayRate: string;
  /** 화면 표기 그대로 "100엔 = 919.20원", "1달러 = 1,380.50원" */
  label: string;
  rateType: RateType;
  /** 출처 "데모 매매기준율" 등. 화면 "{source} · HH:mm 갱신" */
  source: string;
  /** 출처 표기에 링크가 필요한 출처(ExchangeRate-API 약관)일 때만 있다. 화면은 source를 이 링크로 감싼다 */
  sourceUrl?: string;
  /** 고시 시각(ISO 8601 KST) */
  effectiveAt: string;
  fetchedAt: string;
}

/** GET /api/trips/:tripId/fx-policy (FR-806·807, WF-29) */
export interface TripFxView {
  baseCurrency: 'KRW';
  tripCurrency: string;
  currencyNameKo: string;
  displayUnit: number;
  /** KRW 여정이면 true. 화면은 환율 섹션을 숨긴다 */
  isKrwTrip: boolean;
  /** 여행 통화의 최신 고시. 고시가 없거나 KRW 여정이면 null(화면 "—") */
  current: FxRateView | null;
  policy: FxPolicy;
  /** 고시 단위당 원, 소수 둘째 자리("919.20"). FIXED가 아니어도 마지막 입력값을 돌려준다 */
  fixedRate: string | null;
  policyChangedAt: string | null;
  /** 그룹장 ∧ 시작 전·진행 중 ∧ 외화 여정 */
  canEdit: boolean;
  /** Trip.version. PATCH에 그대로 보낸다 */
  version: number;
}

/** PATCH /api/trips/:tripId/fx-policy 요청 */
export interface UpdateFxPolicyRequest {
  policy: FxPolicy;
  /** FIXED일 때 필수. 고시 단위당 원, 소수 둘째 자리까지("919.20") */
  fixedRate?: string;
  version: number;
}

/** PATCH /api/trips/:tripId/fx-policy 응답 */
export interface UpdateFxPolicyResponse {
  fx: TripFxView;
  /** 원화가 바뀐 결제 수(취소 자식 포함). 0이어도 토스트는 화면이 정한다 */
  recalculatedCount: number;
}

/** POST /api/internal/jobs/fx */
export interface FxJobResult {
  source: string;
  currencies: string[];
  fetched: number;
  inserted: number;
  /** 직전 고시와 차이가 너무 커서(이상값) 저장하지 않은 고시 수 */
  rejected: number;
  /** 새 고시·청구 확정으로 원화를 다시 계산한 여정 수 */
  recalculatedTrips: number;
}

/**
 * GET /api/fx/spot-series?base=&from=&to= — 기간(KST 날짜, 최대 400일)의 매매기준율 고시와 그 직전 고시 1건(시각 오름차순).
 * 화면이 여러 결제의 "결제 시각 기준" 추정 원화를 한 번에 계산할 때 쓴다(거래 내역 파일 가져오기 W10 — 결제 시각은 서버로 보내지 않는다).
 * 결제 시각 이전 고시가 없으면 추정하지 않는다(카드 불러오기 estimatedKrwAmount와 같은 규칙)
 */
export interface FxSpotSeriesResponse {
  currency: string;
  rates: { rate: string; effectiveAt: string }[];
}
