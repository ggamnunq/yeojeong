import { ADMIN_TOTP } from '@yeojeong/shared'

// 관리자 화면 표시 형식. 서버 시각은 ISO 8601(KST 오프셋)이고, 화면은 KST로 보여 준다.

const KST_OFFSET_MS = 9 * 60 * 60 * 1000

function kst(value: string): string | null {
  const at = Date.parse(value)
  if (Number.isNaN(at)) return null
  return new Date(at + KST_OFFSET_MS).toISOString()
}

/** "2026-11-13 14:10" (KST) */
export function formatDateTime(value: string | null | undefined): string {
  if (!value) return '—'
  const iso = kst(value)
  return iso ? `${iso.slice(0, 10)} ${iso.slice(11, 16)}` : '—'
}

/** "2026-11-13" (KST). 날짜만 온 값("2026-11-13")은 그대로 */
export function formatDate(value: string | null | undefined): string {
  if (!value) return '—'
  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) return value
  const iso = kst(value)
  return iso ? iso.slice(0, 10) : '—'
}

export function formatCount(value: number): string {
  return value.toLocaleString('ko-KR')
}

/** 카카오 회원번호 끝 4자리 → "••••1234" */
export function maskedKakaoId(last4: string | null): string {
  return last4 ? `••••${last4}` : '—'
}

export const TRIP_STATUS_LABEL: Record<string, string> = {
  UPCOMING: '시작 전',
  ONGOING: '진행 중',
  ENDED: '종료',
}

export const CONSENT_LABEL: Record<string, string> = {
  TOS: '서비스 이용약관',
  PRIVACY: '개인정보 수집·이용',
  AGE14: '만 14세 이상',
  MARKETING: '마케팅 수신',
  FIN_LINK: '금융정보 연동',
  FIN_PRIVACY: '금융 개인정보',
  THIRD_PARTY: '제3자 제공',
  CARD_IMPORT: '카드 내역 불러오기',
}

/** 남은 대기 시간 → "45초" · "15분" */
export function formatWait(seconds: number): string {
  return seconds < 60 ? `${seconds}초` : `${Math.ceil(seconds / 60)}분`
}

/** 카드 승인내역 불러오기 허용 상태 한 줄 */
export function cardImportLabel({ allowlisted, enabled }: { allowlisted: boolean; enabled: boolean }): string {
  return `${allowlisted ? '허용 목록' : '목록 밖'} · ${enabled ? '켜짐' : '꺼짐'}`
}

/** 인증 코드(TOTP) 입력값: 숫자만, 6자리까지 */
export const totpDigits = (value: string) => value.replace(/\D/g, '').slice(0, ADMIN_TOTP.DIGITS)
/** 인증 코드를 6자리 다 넣었는지 */
export const isTotpComplete = (value: string) => value.length === ADMIN_TOTP.DIGITS
