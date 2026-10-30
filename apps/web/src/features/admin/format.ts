import { ADMIN_TOTP, type AdminFeatureOffReason, type FeatureKey, type FeatureMode } from '@yeojeong/shared'

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

/** 카드 불러오기 권한 출처: env 목록(회수 불가)이 먼저, 관리자 페이지 권한, 없음 */
export function cardImportSourceLabel({ allowlisted, granted }: { allowlisted: boolean; granted: boolean }): string {
  if (allowlisted && granted) return 'env · 관리자 권한'
  if (allowlisted) return 'env 허용 목록'
  if (granted) return '관리자 권한'
  return '권한 없음'
}

/** 카드 승인내역 불러오기 허용 상태 한 줄 */
export function cardImportLabel(access: { allowlisted: boolean; granted: boolean; enabled: boolean }): string {
  return `${cardImportSourceLabel(access)} · ${access.enabled ? '켜짐' : '꺼짐'}`
}

/** 기능 권한 이름(표 열 머리·다이얼로그) */
export const FEATURE_LABEL: Record<FeatureKey, string> = {
  CARD_IMPORT: '카드 불러오기',
  FILE_IMPORT_WECHAT: '위챗페이 파일',
  FILE_IMPORT_ALIPAY: '알리페이 파일',
}

/** 기능의 단계를 정하는 env 이름 */
export const FEATURE_ENV_NAME: Record<FeatureKey, string> = {
  CARD_IMPORT: 'FEATURE_CARD_IMPORT',
  FILE_IMPORT_WECHAT: 'FEATURE_FILE_IMPORT',
  FILE_IMPORT_ALIPAY: 'FEATURE_FILE_IMPORT',
}

export const FEATURE_MODE_LABEL: Record<FeatureMode, string> = {
  off: '꺼짐',
  allowlist: '허용 목록',
  on: '전체 공개',
}

/** 기능 실제 단계 안내 */
export const FEATURE_MODE_NOTICE: Record<FeatureMode, string> = {
  off: '꺼져 있어 권한이 있어도 보이지 않아요',
  allowlist: '권한을 준 회원에게만 보여요',
  on: '권한과 상관없이 모든 회원에게 보여요',
}

/** 설정과 달리 꺼진 이유 */
export const FEATURE_OFF_REASON: Record<AdminFeatureOffReason, string> = {
  CODEF_KEYS_MISSING: 'CODEF 키가 없어 꺼짐',
  IMPORT_KEY_MISSING: 'importKey 전용 키가 없어 꺼짐',
  PROVIDER_DISABLED: 'FILE_IMPORT_PROVIDERS에 없어 꺼짐',
}

/** 인증 코드(TOTP) 입력값: 숫자만, 6자리까지 */
export const totpDigits = (value: string) => value.replace(/\D/g, '').slice(0, ADMIN_TOTP.DIGITS)
/** 인증 코드를 6자리 다 넣었는지 */
export const isTotpComplete = (value: string) => value.length === ADMIN_TOTP.DIGITS
