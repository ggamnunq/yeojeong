import type { ProgressStepsStep } from '../../ds'

// 가입 진행 막대(화면명세 WF-03·04, v0.6.0). 토스 연결 기능이 켜져 있으면 4단계(닉네임 · 약관 · 토스 안내 · 연결),
// 꺼져 있으면(기본, FR-006) 2단계(닉네임 1/2 · 약관 2/2).
// TODO(DS18): Progress/Steps에 total이 들어오면 ShellOnboarding에 단계 수를 넘기고 이 변환을 지운다.
// 지금 DS 막대는 4칸 고정이라 2단계는 같은 폭(1/2 = 2칸, 2/2 = 4칸)으로 그린다.

/** 가입 단계(닉네임 1 · 약관 2) → DS Progress/Steps Step */
export function signupProgress(step: 1 | 2, accountLink: boolean): ProgressStepsStep {
  return accountLink ? step : step === 1 ? 2 : 4
}
