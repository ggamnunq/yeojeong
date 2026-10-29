import { fieldErrorPaths, isApiError } from '../../api'

// 수동 결제 시트 문구(화면명세 K절 · K-0 · 0-9 제안 문구)와 서버 400 필드 에러 읽기.

export const COPY = {
  added: '추가했어요',
  saved: '저장했어요',
  deleted: '삭제했어요',
  retry: '잠시 후 다시 시도해 주세요',
  memoPlaceholder: '예) 저녁',
  now: '지금',
  noTrip: '추가 안 함',
  sharedDeleteTrip: '공동 결제를 삭제할까요?',
  sharedDeleteWallet: '공동 결제도 삭제할까요?',
  sharedDeleteMessage: '다른 멤버의 내역과 정산에서 빠져요',
} as const

/** 필드 에러 한 줄(K-0). 서버 문구가 아니라 화면 문구를 쓴다 */
export const FIELD_COPY = {
  overLimit: '1억 원 이하로 입력해 주세요',
  amount: '금액을 확인해 주세요',
  memo: '40자까지 입력할 수 있어요',
  occurredAt: '날짜를 확인해 주세요',
  currency: '통화를 확인해 주세요',
  tripId: '여정을 다시 골라 주세요',
} as const

export type ManualField = 'amount' | 'memo' | 'occurredAt' | 'currency' | 'tripId'
export type ManualFieldErrors = Partial<Record<ManualField, string>>

const FIELDS: readonly ManualField[] = ['amount', 'memo', 'occurredAt', 'currency', 'tripId']

/**
 * 400 VALIDATION_FAILED → 필드별 화면 문구(K-0). 폼에 있는 필드(금액·내용·날짜·통화·여정)가 하나도 없으면 null —
 * 그 밖(addToWallet · participantMembershipIds · 결제자 walletLinked)은 버튼·행 조건으로 막는 필드라 토스트로 처리한다
 */
export function manualFieldErrors(error: unknown): ManualFieldErrors | null {
  if (!isApiError(error) || error.code !== 'VALIDATION_FAILED') return null
  const paths = fieldErrorPaths(error)
  const picked: ManualFieldErrors = {}
  for (const key of FIELDS) if (paths.includes(key)) picked[key] = FIELD_COPY[key]
  return Object.keys(picked).length > 0 ? picked : null
}
