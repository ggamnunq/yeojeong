import type { AuthSessionResponse, ConsentDocumentSummary } from '@yeojeong/shared'
import type { ConsentId } from '../../api'

// 인증·동의 플로우에서만 쓰는 요청·응답 타입(기능명세 6-3 auth·consents·wallet).
// 응답 모양은 @yeojeong/shared(서버 1차)를 쓰고, 요청 본문은 서버 DTO에 맞춰 여기 둔다.

export type ConsentMethod = 'ALL' | 'INDIVIDUAL'

/** 동의를 받은 화면(UserConsent.screen). 연동 동의 시트는 진입 화면 값을 보낸다 */
export type FinConsentScreen = 'WF-05' | 'WF-28' | 'WF-42'

/** GET /api/consents/documents?stage= 한 행 = 동의 문서 현재 시행 버전. 서버는 isDraft(시행 전 초안)도 싣는다 */
export type ConsentDocument = ConsentDocumentSummary & { isDraft?: boolean }

export interface ConsentAgreement {
  consentId: ConsentId
  version: string
  agreed: boolean
}

/** POST /api/auth/signup → 201 Me(같은 카카오 계정이 이미 가입돼 있으면 200 Me) */
export interface SignupRequest {
  nickname: string
  agreements: ConsentAgreement[]
  method: ConsentMethod
}

/** POST /api/auth/reconsent → 204 */
export interface ReconsentRequest {
  agreements: ConsentAgreement[]
  method: ConsentMethod
}

/** POST /api/consents → 201 { valid: true } */
export interface FinConsentRequest {
  stage: 'FIN_LINK'
  agreements: ConsentAgreement[]
  method: ConsentMethod
  screen: FinConsentScreen
}

export type ConnectionPurpose = 'SIGNUP' | 'WALLET_ADD' | 'RECONNECT'

/** POST /api/payment-connections */
export interface StartConnectionRequest {
  provider: 'TOSS'
  purpose: ConnectionPurpose
  reconnectConnectionId?: string
}

/** 201 { attemptId, authUrl, expiresAt } */
export interface StartConnectionResponse {
  attemptId: string
  authUrl: string
  expiresAt: string
}

/**
 * WF-05b → WF-06(/wallet/connect/toss)으로 넘기는 location.state.
 * WF-06의 "토스 다시 열기"는 같은 authUrl을 다시 열고, ✕·실패면 from으로 돌아간다.
 */
export interface ConnectHandoffState {
  authUrl: string
  purpose: ConnectionPurpose
  from: string
}

/** 목 모드 전용: GET /api/auth/kakao 를 fetch로 부르면 카카오 로그인 + 콜백을 흉내 내고 갈 곳을 돌려준다 */
export interface MockKakaoResponse {
  redirect: string
}

/** 서버 1차(S1)는 세션 응답(200)에 reconsentRequired를 싣는다. 뼈대(app/session)의 SessionResponse는 403만 본다 */
export type SessionWithReconsent = AuthSessionResponse
