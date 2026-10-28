import type { AuthSessionResponse, ConsentDocumentSummary, ConsentScreen } from '@yeojeong/shared'

// 인증·동의 플로우에서만 쓰는 요청·응답 타입(기능명세 6-3 auth·consents·wallet).
// 응답 모양은 @yeojeong/shared(서버 1차)를 쓰고, 요청 본문은 서버 DTO에 맞춰 여기 둔다.

/** GET /api/consents/documents?stage= 한 행 = 동의 문서 현재 시행 버전. 서버는 isDraft(시행 전 초안)도 싣는다 */
export type ConsentDocument = ConsentDocumentSummary
export type FinConsentScreen = Extract<ConsentScreen, 'WF-05' | 'WF-28' | 'WF-42'>
export type {
  ConsentAgreementInput as ConsentAgreement,
  ConsentMethod,
  ConsentSubmitRequest as FinConsentRequest,
  ReconsentRequest,
  SignupRequest,
} from '@yeojeong/shared'

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
