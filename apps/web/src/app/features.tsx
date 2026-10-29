import { useQuery } from '@tanstack/react-query'
import type { ComponentType } from 'react'
import { Navigate, useParams, type Params } from 'react-router'
import type { SessionResponse } from '../api'
import { sessionQuery } from './session'

// 기능 플래그(기능명세 FR-006, 화면명세 0-10). 서버가 GET /api/auth/session 응답 features에 싣는다.
// 값이 없거나(구버전 서버) 세션을 못 읽었으면 false로 본다(fail closed).
// features.accountLink = 토스 연결(계좌·카드 불러오기). false면 연결 흐름·연동 동의·기간 외 결제·연결 만료·동기화를 숨기고
// 지갑은 수동 지갑(HF-49), 가입은 2단계(닉네임 1/2 → 약관 2/2)다. 코드는 지우지 않는다.

/**
 * 세션 응답의 features. TODO(S7): shared AuthSessionResponse에 features가 들어오면 그 타입으로 바꾼다.
 */
export type SessionFeatures = { accountLink: boolean }

/** 세션 응답 + features(S7 계약 전 로컬 타입) */
export type SessionWithFeatures = SessionResponse & { features?: Partial<SessionFeatures> }

/** 토스 연결 기능을 쓰는가. 응답이 없거나 값이 boolean true가 아니면 false */
export function accountLinkOf(session: SessionResponse | undefined | null): boolean {
  return (session as SessionWithFeatures | undefined | null)?.features?.accountLink === true
}

/**
 * features.accountLink. 세션 쿼리 캐시만 읽는다(여기서 세션을 새로 부르지 않는다 — 가드·화면이 이미 받아 둔다).
 * 아직 없으면 false
 */
export function useAccountLink(): boolean {
  const { data } = useQuery({ ...sessionQuery(), enabled: false })
  return accountLinkOf(data)
}

/**
 * 연결 기능 화면(토스 인증·선택·완료, 가입 토스 안내, 기간 외 결제)을 플래그 뒤에 둔다.
 * false면 화면을 그리지 않고 fallback 주소로 보낸다(화면명세 0-10: URL로 오면 진입 라우팅 또는 지갑).
 */
export function accountLinkOnly(Page: ComponentType, fallback: (params: Readonly<Params<string>>) => string): ComponentType {
  function AccountLinkOnly() {
    const on = useAccountLink()
    const params = useParams()
    if (!on) return <Navigate replace to={fallback(params)} />
    return <Page />
  }
  AccountLinkOnly.displayName = `AccountLinkOnly(${Page.displayName ?? Page.name ?? 'Page'})`
  return AccountLinkOnly
}
