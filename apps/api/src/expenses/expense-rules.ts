import {
  splitEvenly,
  type ChangeAction,
  type ClassifyStatus,
  type EditBlockReason,
  type ExpensePermissions,
  type ExpenseStatus,
  type SplitResult,
  type TripStatus,
} from '@yeojeong/shared';
import type { Prisma } from '../generated/prisma/client.js';

// 결제 도메인 규칙(DB 없이 테스트하는 순수 함수). 기능명세 3-2 상태 전이, 4-2 가시성, 4-3 분담.

// ─── 가시성(4-2, I-8) ───

/**
 * 목록·상세 조회의 공통 필터: 취소 자식은 단독으로 나오지 않고, 미확정·개인은 결제자 본인에게만.
 * 모든 조회에 이 조건을 AND로 건다(화면 숨김으로 처리하지 않는다).
 */
export function visibleExpenseWhere(
  viewerMembershipId: string,
): Prisma.ExpenseWhereInput {
  return {
    refundOfExpenseId: null,
    OR: [{ status: 'SHARED' }, { payerMembershipId: viewerMembershipId }],
  };
}

export function isVisibleTo(
  expense: {
    status: ExpenseStatus;
    payerMembershipId: string;
    refundOfExpenseId: string | null;
  },
  viewerMembershipId: string,
): boolean {
  if (expense.refundOfExpenseId !== null) return false;
  return (
    expense.status === 'SHARED' ||
    expense.payerMembershipId === viewerMembershipId
  );
}

/**
 * 응답에 쓰는 상태. 종료된 여정의 미확정은 개인으로 본다(3-2 "여정 종료 시 자동 처리").
 * trip.ended 구독(리스너)이 실패해 DB에 PENDING이 남아도 화면은 개인으로 받는다. 가시성은 둘 다 결제자만이라 같다.
 */
export function effectiveStatus(
  status: ExpenseStatus,
  tripStatus: TripStatus,
): ExpenseStatus {
  return tripStatus === 'ENDED' && status === 'PENDING' ? 'PERSONAL' : status;
}

/** 목록의 status 필터를 DB 조건으로. 종료 후 PENDING 필터는 비고, PERSONAL 필터는 남은 PENDING도 포함한다 */
export function statusFilterWhere(
  status: ExpenseStatus | undefined,
  tripStatus: TripStatus,
): Prisma.ExpenseWhereInput {
  if (!status) return {};
  if (tripStatus === 'ENDED') {
    if (status === 'PENDING') return { id: { in: [] } };
    if (status === 'PERSONAL') {
      return { status: { in: ['PERSONAL', 'PENDING'] } };
    }
  }
  return { status };
}

// ─── 편집 권한(FR-503·512, 4-3) ───

export interface PermissionInput {
  tripStatus: TripStatus;
  isPayer: boolean;
  payerLeft: boolean;
}

/** 우선순위: 종료(LOCKED) > 시작 전 > 결제자 나감(READ_ONLY) > 결제자 아님(READ_ONLY) */
export function computePermissions(input: PermissionInput): ExpensePermissions {
  let reason: EditBlockReason | null = null;
  if (input.tripStatus === 'ENDED') reason = 'TRIP_ENDED';
  else if (input.tripStatus === 'UPCOMING') reason = 'TRIP_NOT_STARTED';
  else if (input.payerLeft) reason = 'PAYER_LEFT';
  else if (!input.isPayer) reason = 'NOT_PAYER';
  return { canEdit: reason === null, reason, isPayer: input.isPayer };
}

// ─── 상태 전이(3-2) ───

/**
 * 결제자가 PUT classification으로 할 수 있는 전이와 로그 action.
 * null = 변경 없음(같은 상태 — SHARED → SHARED는 부담 인원이 바뀔 때만 PARTICIPANTS_CHANGED).
 * PENDING으로 되돌리는 전이는 없다. 종료 시 자동 처리(AUTO_PERSONAL_ON_END)는 시스템 전이라 여기 없다.
 */
export const CLASSIFICATION_TRANSITIONS: Readonly<
  Record<ExpenseStatus, Readonly<Record<ClassifyStatus, ChangeAction | null>>>
> = {
  PENDING: { PERSONAL: 'CONFIRM_PERSONAL', SHARED: 'CONFIRM_SHARED' },
  PERSONAL: { PERSONAL: null, SHARED: 'PERSONAL_TO_SHARED' },
  SHARED: { PERSONAL: 'SHARED_TO_PERSONAL', SHARED: 'PARTICIPANTS_CHANGED' },
};

export interface ClassificationCurrent {
  status: ExpenseStatus;
  /** 지금 부담 인원(SHARED만, 그 밖은 빈 배열) */
  participantIds: readonly string[];
  firstSharedAt: Date | null;
  confirmedAt: Date | null;
}

export interface ClassificationRequestInput {
  status: ClassifyStatus;
  participantIds?: readonly string[];
  confirmSharedToPersonal?: boolean;
}

export type ClassificationPlan =
  | { kind: 'NOOP' }
  | {
      kind: 'ERROR';
      code: 'PARTICIPANTS_REQUIRED' | 'PAYER_ONLY' | 'CONFIRM_REQUIRED';
    }
  | {
      kind: 'CHANGE';
      action: ChangeAction;
      nextStatus: ClassifyStatus;
      /** SHARED면 새 부담 인원, PERSONAL이면 [] */
      participantIds: string[];
      /** changedAfterShared를 true로 */
      markChanged: boolean;
      setFirstSharedAt: boolean;
      setConfirmedAt: boolean;
      /** 공동이 되는 전이(중복 의심 판정·다른 여정 공동 확인 대상) */
      becomesShared: boolean;
      /** 공동에서 빠지는 전이(ExpenseShare 삭제·중복 묶음 해제) */
      leavesShared: boolean;
    };

const sameSet = (a: readonly string[], b: readonly string[]) =>
  a.length === b.length && a.every((id) => b.includes(id));

/** 공동인데 부담 인원이 결제자 혼자(미결 Q-08 → 서버도 막는다. 결제자를 빼고 남만 고르는 건 허용) */
export function isPayerOnly(
  participantIds: readonly string[],
  payerMembershipId: string,
): boolean {
  return participantIds.length === 1 && participantIds[0] === payerMembershipId;
}

/**
 * 현재 상태와 요청으로 할 일을 정한다(6-3 "같은 상태·같은 부담 인원이면 변경 없이 200").
 * participantIds가 없으면 PENDING·PERSONAL → SHARED는 활성 멤버 전원(4-3 기본값), SHARED → SHARED는 그대로.
 */
export function planClassification(
  current: ClassificationCurrent,
  request: ClassificationRequestInput,
  activeMemberIds: readonly string[],
  payerMembershipId: string,
): ClassificationPlan {
  const action = CLASSIFICATION_TRANSITIONS[current.status][request.status];

  if (request.status === 'PERSONAL') {
    if (action === null) return { kind: 'NOOP' };
    if (
      current.status === 'SHARED' &&
      request.confirmSharedToPersonal !== true
    ) {
      return { kind: 'ERROR', code: 'CONFIRM_REQUIRED' };
    }
    return {
      kind: 'CHANGE',
      action,
      nextStatus: 'PERSONAL',
      participantIds: [],
      markChanged: current.status === 'SHARED',
      setFirstSharedAt: false,
      setConfirmedAt: current.confirmedAt === null,
      becomesShared: false,
      leavesShared: current.status === 'SHARED',
    };
  }

  const participantIds = [
    ...(request.participantIds ??
      (current.status === 'SHARED' ? current.participantIds : activeMemberIds)),
  ];
  if (participantIds.length === 0) {
    return { kind: 'ERROR', code: 'PARTICIPANTS_REQUIRED' };
  }
  if (current.status === 'SHARED') {
    if (sameSet(participantIds, current.participantIds))
      return { kind: 'NOOP' };
  }
  if (isPayerOnly(participantIds, payerMembershipId)) {
    return { kind: 'ERROR', code: 'PAYER_ONLY' };
  }
  if (current.status === 'SHARED') {
    return {
      kind: 'CHANGE',
      action: 'PARTICIPANTS_CHANGED',
      nextStatus: 'SHARED',
      participantIds,
      markChanged: true,
      setFirstSharedAt: false,
      setConfirmedAt: false,
      becomesShared: false,
      leavesShared: false,
    };
  }
  const reShared = current.firstSharedAt !== null;
  return {
    kind: 'CHANGE',
    action: action ?? 'CONFIRM_SHARED',
    nextStatus: 'SHARED',
    participantIds,
    // 개인 → 공동은 예전에 공동으로 공개된 적이 있을 때만 "변경됨"(FR-507)
    markChanged: reShared,
    setFirstSharedAt: !reShared,
    setConfirmedAt: current.confirmedAt === null,
    becomesShared: true,
    leavesShared: false,
  };
}

/**
 * 공개를 넓히는 변경인가: PENDING·PERSONAL → SHARED, 또는 SHARED에서 부담 인원에 새 멤버를 넣는 변경.
 * 인원을 줄이기만 하는 변경과 공동 → 개인은 아니다. 결제자의 활성 결제수단이 0개면 이 변경을 막는다(기능명세 4-10 v0.5.7).
 */
export function expandsSharing(
  plan: ClassificationPlan,
  currentParticipantIds: readonly string[],
): boolean {
  if (plan.kind !== 'CHANGE' || plan.nextStatus !== 'SHARED') return false;
  if (plan.becomesShared) return true;
  return plan.participantIds.some((id) => !currentParticipantIds.includes(id));
}

// ─── 부담 인원(4-3) ───

export interface GroupMember {
  id: string;
  joinOrder: number;
  leftAt: Date | null;
}

/**
 * 부담 인원 후보 = 같은 그룹의 활성 멤버 + 지금 부담 인원에 이미 있는 나간 멤버(해제만 가능, 다시 넣기 불가 — 미결 Q-30).
 * 후보가 아닌 ID를 돌려준다(→ 400 PARTICIPANT_NOT_MEMBER).
 */
export function invalidParticipants(
  requested: readonly string[],
  members: readonly GroupMember[],
  currentParticipantIds: readonly string[],
): string[] {
  const byId = new Map(members.map((m) => [m.id, m]));
  return requested.filter((id) => {
    const member = byId.get(id);
    if (!member) return true;
    return member.leftAt !== null && !currentParticipantIds.includes(id);
  });
}

/** 균등 분할(FR-509). 부담 인원은 가입 순으로 정렬해 저장한다(나머지는 결제자, 없으면 가입 순 첫 사람) */
export function computeSplit(
  netKrw: number,
  participantIds: readonly string[],
  members: readonly GroupMember[],
  payerMembershipId: string,
): SplitResult {
  const joinOrder = new Map(members.map((m) => [m.id, m.joinOrder]));
  const participants = participantIds
    .map((id) => ({ membershipId: id, joinOrder: joinOrder.get(id) ?? 0 }))
    .sort((a, b) => a.joinOrder - b.joinOrder);
  return splitEvenly(netKrw, participants, payerMembershipId);
}

/** 저장된 부담 행에서 1인·나머지를 다시 읽는다(상세 응답) */
export function splitFromShares(
  netKrw: number,
  shares: readonly { membershipId: string; isRemainderHolder: boolean }[],
): {
  perPersonKrw: number | null;
  remainderKrw: number;
  remainderHolderMembershipId: string | null;
} {
  if (shares.length === 0) {
    return {
      perPersonKrw: null,
      remainderKrw: 0,
      remainderHolderMembershipId: null,
    };
  }
  const perPersonKrw = Math.floor(netKrw / shares.length);
  return {
    perPersonKrw,
    remainderKrw: netKrw - perPersonKrw * shares.length,
    remainderHolderMembershipId:
      shares.find((s) => s.isRemainderHolder)?.membershipId ?? null,
  };
}

// ─── 변경 이력(FR-510) ───

/** ExpenseChangeLog.before/after 형식 {status, participantIds, netKrwAmount, perPersonKrw} */
export type ChangeSnapshot = {
  status: ExpenseStatus;
  participantIds: string[];
  netKrwAmount: number;
  perPersonKrw: number | null;
};

export function changeSnapshot(
  status: ExpenseStatus,
  participantIds: readonly string[],
  netKrwAmount: number,
): ChangeSnapshot {
  return {
    status,
    participantIds: [...participantIds],
    netKrwAmount,
    perPersonKrw:
      status === 'SHARED' && participantIds.length > 0
        ? Math.floor(netKrwAmount / participantIds.length)
        : null,
  };
}
