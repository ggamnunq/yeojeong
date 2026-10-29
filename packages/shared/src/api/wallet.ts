import type { CursorPage } from "../api.js";
import type { ExpenseStatus, TripStatus, TxKind, TxSource } from "../domain.js";
import type { ExpenseDetailResponse } from "./expenses.js";

// 내 지갑(직접 입력 + 가져온 거래) API 타입(S7). 시각 = ISO 8601 KST, 원통화 금액 = 문자열 decimal, 원화 = 정수.

/** 지갑 목록 페이지 크기. 기본 50, 최대 100 */
export const WALLET_ENTRY_LIST_LIMIT = { DEFAULT: 50, MAX: 100 } as const;

export const WALLET_ENTRY_FIELD_VALUES = [
  "amount",
  "currency",
  "memo",
  "occurredAt",
] as const;
/** 지갑 항목에서 바꿀 수 있는 필드 */
export type WalletEntryField = (typeof WALLET_ENTRY_FIELD_VALUES)[number];

/** 지갑 항목이 연결된 여정 결제 요약 */
export interface WalletLinkedTrip {
  tripId: string;
  groupName: string;
  placeLabel: string;
  tripStatus: TripStatus;
  expenseId: string;
  /** 종료된 여정의 미확정은 PERSONAL로 나온다 */
  expenseStatus: ExpenseStatus;
  expenseVersion: number;
}

/** GET /api/wallet/entries 항목 */
export interface WalletEntry {
  id: string;
  source: TxSource;
  /** 직접 입력은 항상 APPROVAL */
  kind: TxKind;
  occurredAt: string;
  localDate: string;
  /** 표시 이름. 직접 입력은 메모(비었으면 "결제"), 가져온 거래는 가맹점 */
  merchantName: string;
  /** 직접 입력의 메모(비었으면 null). 가져온 거래는 null */
  memo: string | null;
  /** 부호 포함 decimal(취소는 음수) */
  amount: string;
  currency: string;
  /** 원화. 연결된 여정 결제가 있으면 그 원화, 없으면 KRW는 금액·외화는 결제 시점 매매기준율 추정(고시가 없으면 null) */
  krwAmount: number | null;
  /** "토스뱅크 체크카드 1934". 직접 입력은 null */
  paymentMethodLabel: string | null;
  /** 연결된 여정 결제(활성 멤버로 남아 있는 여정만). 없으면 null */
  linkedTrip: WalletLinkedTrip | null;
  /** 지금 바꿀 수 있는 필드. 가져온 거래는 [], 종료된 여정(또는 나간 여정)에 연결된 항목은 ["memo"] */
  editableFields: WalletEntryField[];
  /** 연결 여정을 바꿀 수 있는지(직접 입력 + 연결 없음 또는 미확정, Q-46) */
  canChangeTrip: boolean;
  /** 지울 수 있는지(직접 입력만) */
  canDelete: boolean;
  version: number;
}

/** GET /api/wallet/entries?cursor=&limit= (최신순) */
export interface WalletEntryListResponse extends CursorPage<WalletEntry> {
  /**
   * 이번 달(KST 1일 00:00 ~ 다음 달 1일 00:00, occurredAt 기준) 지갑 항목 원화 합(S7b, Q-51). 취소는 음수로 상계.
   * 항목 원화는 krwAmount와 같은 규칙이고, krwAmount가 null인 항목은 결제 시점 매매기준율로 추정해 더한다(고시가 없으면 뺀다).
   * 커서와 무관하게 전체 기준이며 모든 페이지에 같은 값을 준다(요청마다 다시 계산). 화면은 첫 페이지 값을 쓰면 된다
   */
  monthTotalKrw: number;
  /**
   * 합계에 추정이 섞였는지 → "약 ₩…". 연결 없는 외화 항목의 매매기준율 추정 원화를 썼거나,
   * krwAmount가 null이라 추정했거나 고시가 없어 뺀 항목이 있으면 true. KRW·여정 결제 원화·카드사·제공자 원화만이면 false
   */
  monthTotalEstimated: boolean;
}

/** POST /api/wallet/entries — 지갑에 결제 직접 추가. 필수는 amount뿐 */
export interface CreateWalletEntryRequest {
  /** 양수 decimal 문자열. 소수 자리는 통화 기준(KRW·JPY·VND·IDR 0, 그 밖 2) */
  amount: string;
  /** 기본 = trip-candidates의 defaultCurrency와 같은 규칙(진행 중 여정의 통화, 없으면 KRW) */
  currency?: string;
  /** 내용. 최대 40자. 비우면 "결제" */
  memo?: string;
  /** ISO 8601. 기본 = 지금 */
  occurredAt?: string;
  /**
   * 생략: 자동 연결(결제 시각이 기간 안인 예정·진행 중 여정 = trip-candidates의 suggestedTripId).
   * 문자열: 그 여정에 연결(내가 활성 멤버인 예정·진행 중 여정이면 기간 밖이어도 된다 → 여정 전/후 그룹).
   * null: 여정에 연결하지 않는다
   */
  tripId?: string | null;
  /** 중복 제출 방지 UUID. 같은 값으로 다시 보내면 처음 만든 항목을 그대로 돌려준다 */
  clientRequestId?: string;
}

/** POST /api/wallet/entries · PATCH /api/wallet/entries/:entryId 응답 */
export interface WalletEntryMutationResponse {
  entry: WalletEntry;
  /** 연결된 여정 결제(entry.linkedTrip이 있을 때). 새로 연결되면 미확정. 없으면 null */
  linkedExpense: ExpenseDetailResponse | null;
}

/**
 * PATCH /api/wallet/entries/:entryId — 직접 입력 항목만. 보낸 필드만 바꾼다.
 * 연결된 여정 결제에도 반영한다(공동이면 version이 오르고 "변경됨" 표시).
 * 종료된(또는 나간) 여정에 연결된 항목은 memo만 바꿀 수 있고 지갑에만 반영된다
 * (금액·통화·시각은 409 EXPENSE_LOCKED, details.lockedFields = ["amount","currency","occurredAt"]).
 */
export interface UpdateWalletEntryRequest {
  version: number;
  amount?: string;
  currency?: string;
  /** 빈 문자열이면 메모를 지운다(표시 이름 "결제") */
  memo?: string;
  occurredAt?: string;
  /**
   * 연결 여정 바꾸기(Q-46): 연결된 결제가 없거나 미확정(PENDING)일 때만. uuid = 예정·진행 중 여정으로 옮김(미확정으로),
   * null = 연결 끊기(미확정 결제 삭제). 확정(개인·공동) 뒤에는 409 EXPENSE_LOCKED. 생략하면 그대로
   */
  tripId?: string | null;
}

/** GET /api/wallet/trip-candidates?at= 의 항목 */
export interface WalletTripCandidate {
  tripId: string;
  groupName: string;
  placeLabel: string;
  status: Extract<TripStatus, "UPCOMING" | "ONGOING">;
  startDate: string;
  endDate: string;
  currency: string;
  /** at이 여정 기간(KST 시작일 00:00 ~ 종료일 23:59:59) 안인지. 밖이면 연결해도 여정 전/후 그룹으로 들어간다 */
  inPeriod: boolean;
}

/**
 * GET /api/wallet/trip-candidates?at=<ISO> — 지갑 항목을 연결할 수 있는 여정(내가 활성 멤버인 예정·진행 중).
 * 정렬: 기간 안 먼저 → 진행 중 먼저 → 시작일이 at에 가까운 순. items[0].inPeriod가 true면 그 여정이 자동 연결 대상(= suggestedTripId)
 */
export interface WalletTripCandidatesResponse {
  items: WalletTripCandidate[];
  /** 자동 연결 대상. 기간 안 여정이 없으면 null(지갑에만 기록) */
  suggestedTripId: string | null;
  /** 통화 기본값: 같은 정렬에서 첫 진행 중 여정의 통화, 없으면 KRW */
  defaultCurrency: string;
}
