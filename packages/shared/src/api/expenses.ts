import type {
  CursorPage,
  ExpenseDetail,
  ExpenseListItem,
  MemberSummary,
} from "../api.js";
import type {
  EditBlockReason,
  ExpenseStatus,
  FxPolicy,
  TripStatus,
} from "../domain.js";

// 결제(expenses) API 요청·응답 타입(기능명세 6-3 "결제", FR-501~512·406~408).
// 부록 B의 ExpenseListItem·ExpenseDetail(../api.ts)을 그대로 쓰고, 화면에 더 필요한 필드만 여기서 넓힌다.
// 금액: 원화 = 정수, 원통화 = 문자열 decimal(부호 포함). 시각 = ISO 8601 KST("2026-11-13T08:50:00+09:00"), 날짜 = "2026-11-13"(KST).

/** 목록 페이지 크기. 기본 50, 최대 100(6-1) */
export const EXPENSE_LIST_LIMIT = { DEFAULT: 50, MAX: 100 } as const;

/** 기간 외 결제를 한 번에 추가할 수 있는 최대 건수(FR-408) */
export const OUT_OF_PERIOD_ADD_MAX = 50;

/** 기간 외 "여정 전" 후보 범위: [startAt − 60일, startAt) (4-1-6, 미결 Q-27) */
export const OUT_OF_PERIOD_LOOKBACK_DAYS = 60;

/** 직접 입력 결제: 메모가 비었을 때 저장·표시하는 이름 */
export const MANUAL_DEFAULT_MERCHANT_NAME = "결제";

/** 직접 입력 결제: 메모(내용) 최대 길이. 앞뒤 공백·줄바꿈·제어문자는 서버가 지운다(FR-427) */
export const MANUAL_MEMO_MAX_LENGTH = 40;

/** 직접 입력 결제: 원화 환산 금액 상한 ₩100,000,000(FR-427) */
export const MANUAL_KRW_AMOUNT_MAX = 100_000_000;

/** 직접 입력 결제: 결제 시각 허용 범위 — 미래는 지금 + 5분까지, 과거는 365일까지(FR-427) */
export const MANUAL_OCCURRED_AT_FUTURE_SECONDS = 300;
export const MANUAL_OCCURRED_AT_PAST_DAYS = 365;

/** 직접 입력 결제의 중복 의심(Q-42): 같은 여정·같은 원화 금액·시각 차이 ±30분이면 결제자와 상관없이 묶는다 */
export const MANUAL_DUPLICATE_WINDOW_SECONDS = 1800;

/** 직접 입력 결제: 원통화 금액 정수부 최대 자리 */
export const MANUAL_AMOUNT_MAX_INTEGER_DIGITS = 12;

/** 중복 의심 판정 시각 차이(초) (4-1-5) */
export const DUPLICATE_WINDOW_SECONDS = 120;

export const EXPENSE_LIST_ORDER_VALUES = ["desc", "asc"] as const;
/** desc = 리스트(최신순), asc = 타임라인(시간순) */
export type ExpenseListOrder = (typeof EXPENSE_LIST_ORDER_VALUES)[number];

export const OUT_OF_PERIOD_SIDE_VALUES = ["BEFORE", "AFTER"] as const;
/** 여정 전 · 여정 후 */
export type OutOfPeriodSide = (typeof OUT_OF_PERIOD_SIDE_VALUES)[number];

/** 분류 요청의 목표 상태. 미확정(PENDING)으로 되돌릴 수는 없다 */
export const CLASSIFY_STATUS_VALUES = ["PERSONAL", "SHARED"] as const;
export type ClassifyStatus = (typeof CLASSIFY_STATUS_VALUES)[number];

/** GET /api/trips/:tripId/expenses 쿼리 */
export interface ExpenseListQuery {
  /** 이전 응답의 nextCursor(불투명 문자열) */
  cursor?: string;
  /** 1~100, 기본 50 */
  limit?: number;
  /** PENDING = 확인 필요(내 미확정)만. 가시성 필터는 항상 함께 걸린다 */
  status?: ExpenseStatus;
  /** 타임라인 Day N(1부터). 그 KST 날짜의 결제만 */
  day?: number;
  /** 기본 desc */
  order?: ExpenseListOrder;
}

/** 환불 묶음의 취소 줄(FR-406). 시각 오름차순 */
export interface ExpenseRefundLine {
  id: string;
  occurredAt: string;
  /** 음수 */
  krwAmount: number;
  /** 음수 문자열 decimal */
  originalAmount: string;
}

/** 결제 목록 행 = ExpenseListItem + 환불 묶음 표시용 필드 */
export interface ExpenseRow extends ExpenseListItem {
  /** 환불 전 원 결제 원화(묶음의 원 결제 줄). 환불이 없으면 krwAmount와 같다 */
  grossKrwAmount: number;
  /** 환불 반영 원통화 순액(0 이상). WF-41 부제 "¥0" */
  netOriginalAmount: string;
  refunds: ExpenseRefundLine[];
}

/** 날짜 헤더·타임라인 Day 칩에 쓰는 여정 기간 정보 */
export interface ExpenseListPeriod {
  tripStatus: TripStatus;
  startDate: string;
  endDate: string;
  /** 여정 일수(Day 칩 개수) */
  days: number;
  /** 오늘(KST)의 Day. 기간 밖이면 null */
  todayDayIndex: number | null;
}

/** GET /api/trips/:tripId/expenses */
export interface ExpenseListResponse extends CursorPage<ExpenseRow> {
  /** 확인 필요 n건 = 내 미확정 수(취소 자식 제외). 종료 후 0 */
  pendingCount: number;
  /** 진행 중이면 목록 맨 아래 "기간 외 결제 추가 ›" */
  showOutOfPeriodEntry: boolean;
  period: ExpenseListPeriod;
}

/** 결제 상세의 편집 권한. 화면은 이 값과 status·payer.isMe로 시트 모드를 정한다(화면명세 부록 A) */
export interface ExpensePermissions {
  canEdit: boolean;
  /** canEdit=false인 이유. 우선순위 TRIP_ENDED > TRIP_NOT_STARTED > PAYER_LEFT > NOT_PAYER */
  reason: EditBlockReason | null;
  /** 내가 결제자인지(payer.isMe와 같다) */
  isPayer: boolean;
  /**
   * 내가 이 결제를 바꿀 수 있는 사람인지: 직접 입력한 결제(origin MANUAL)는 작성자, 가져온 결제는 결제자.
   * 서버는 항상 채운다
   */
  isAuthor?: boolean;
}

export interface ExpenseFxSnapshot {
  /** 1단위당 원(Expense.fxRate 그대로) */
  rate: string;
  displayUnit: number;
  source: string;
  rateAt: string;
  policy: FxPolicy;
}

/** GET /api/trips/:tripId/expenses/:expenseId 와 분류·중복 해제 응답 */
export interface ExpenseDetailResponse extends ExpenseDetail {
  netOriginalAmount: string;
  refunds: ExpenseRefundLine[];
  fx: ExpenseFxSnapshot | null;
  permissions: ExpensePermissions;
  /**
   * 부담 인원 토글에 그릴 멤버(canEdit일 때만, 아니면 null). 정렬: 나 → 가입 순.
   * 현재 활성 멤버 + 지금 부담 인원에 들어 있는 나간 멤버(isLeft=true — 해제만 가능, 미결 Q-30)
   */
  participantCandidates: MemberSummary[] | null;
  /**
   * 토글의 처음 선택값(canEdit일 때만). SHARED = 지금 부담 인원, 그 밖 = 활성 멤버 전원(4-3 기본값).
   * 미확정 시트의 기본 세그먼트(개인/공동, 미결 Q-01)는 화면이 정한다 — 서버는 어느 쪽이든 받는다.
   */
  defaultParticipantMembershipIds: string[] | null;
  /**
   * 내 지갑에 같은 결제가 있으면 그 지갑 항목 ID(결제자 본인에게만). 없거나 남의 결제면 null.
   * 서버는 항상 채운다
   */
  walletEntryId?: string | null;
}

/** PUT /api/trips/:tripId/expenses/:expenseId/classification (FR-504~508) */
export interface ClassifyExpenseRequest {
  status: ClassifyStatus;
  /**
   * SHARED일 때 부담 인원(결제자 포함 가능, 1명 이상, 겹침 불가).
   * 생략하면 PENDING·PERSONAL → SHARED는 활성 멤버 전원, SHARED → SHARED는 지금 부담 인원 그대로.
   * PERSONAL이면 무시한다.
   */
  participantMembershipIds?: string[];
  /** 마지막으로 받은 결제의 version. 다르면 409 VERSION_CONFLICT(details.current = 최신 ExpenseDetailResponse) */
  version: number;
  /** 공동 → 개인은 확인 다이얼로그(WF-32) 뒤에 true로 보낸다. 없으면 409 SHARED_TO_PERSONAL_CONFIRM_REQUIRED */
  confirmSharedToPersonal?: boolean;
}

/** POST /api/trips/:tripId/expenses/:expenseId/duplicate-dismissal (FR-511) */
export interface DismissDuplicateRequest {
  version: number;
}

/** GET /api/trips/:tripId/out-of-period-candidates?side= 의 항목. 날짜 오름차순 배열로 온다 */
export interface OutOfPeriodCandidate {
  /** 추가 요청에 그대로 보내는 짧은 만료의 서명된 임시 식별자 */
  candidateId: string;
  occurredAt: string;
  localDate: string;
  merchantName: string;
  /** 여정 환율 정책으로 환산한 원화. 환율을 아직 알 수 없으면 null */
  krwAmount: number | null;
  originalAmount: string;
  currency: string;
  /** "토스뱅크 체크카드 1934" */
  paymentMethodLabel: string | null;
}

/** POST /api/trips/:tripId/out-of-period-expenses */
export interface AddOutOfPeriodExpensesRequest {
  /** 후보 조회에서 받은 임시 식별자. 1~50, 겹침 불가 */
  candidateIds: string[];
}

export interface AddOutOfPeriodExpensesResponse {
  added: number;
  /** 추가된 결제(미확정). 날짜 오름차순 */
  items: ExpenseRow[];
}

/**
 * POST /api/trips/:tripId/expenses — 여정에서 결제 직접 추가(예정·진행 중 여정만). 필수는 amount뿐.
 * 분담에 결제자 말고 한 명이라도 있으면 공동(SHARED), 결제자 혼자면 개인(PERSONAL)으로 바로 확정된다.
 */
export interface CreateTripExpenseRequest {
  /** 양수 decimal 문자열. 소수 자리는 통화 기준(KRW·JPY·VND·IDR 0, 그 밖 2) */
  amount: string;
  /** ISO 4217. 기본 = 여정 통화 */
  currency?: string;
  /** 내용. 비우면 "결제"(MANUAL_DEFAULT_MERCHANT_NAME)로 저장된다. 최대 40자 */
  memo?: string;
  /** ISO 8601. 기본 = 지금. 여정 기간 밖이면 여정 전/후 그룹(periodSide)으로 나온다 */
  occurredAt?: string;
  /** 결제자. 기본 = 나. 다른 활성 멤버를 골라 대신 기록할 수 있다(활성 멤버가 아니면 400 PARTICIPANT_NOT_MEMBER) */
  payerMembershipId?: string;
  /** 나누기(부담 인원, 활성 멤버, 1명 이상). 기본 = 활성 멤버 전원. 결제자가 내가 아니면 결제자 혼자로 둘 수 없다(400) */
  participantMembershipIds?: string[];
  /** 내 지갑에도 기록(결제자가 나일 때만, 아니면 400). 기본 false */
  addToWallet?: boolean;
  /** 중복 제출 방지 UUID. 같은 값으로 다시 보내면 처음 만든 결제를 그대로 돌려준다 */
  clientRequestId?: string;
}

/**
 * PATCH /api/trips/:tripId/expenses/:expenseId — 직접 입력한 결제 수정(작성자만, 예정·진행 중).
 * 보낸 필드만 바꾼다. 지갑과 연결된 결제면 금액·통화·메모·시각이 지갑 항목에도 반영된다.
 */
export interface UpdateTripExpenseRequest {
  version: number;
  amount?: string;
  currency?: string;
  /** 빈 문자열이면 기본 이름("결제") */
  memo?: string;
  occurredAt?: string;
  /** 지갑 기록이 있는 결제는 결제자가 나로 고정이라 바꿀 수 없다(400, Q-49) */
  payerMembershipId?: string;
  /** 나누기를 바꾸면 공동/개인이 다시 정해진다(결제자 말고 한 명이라도 있으면 공동) */
  participantMembershipIds?: string[];
  /** 공동 → 개인이 되는 변경은 확인 다이얼로그 뒤 true(없으면 409 SHARED_TO_PERSONAL_CONFIRM_REQUIRED) */
  confirmSharedToPersonal?: boolean;
}
