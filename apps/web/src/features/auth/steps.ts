import type { ProgressStepsStep, ProgressStepsTotal } from '../../ds'

// 가입 진행 막대(화면명세 WF-03·04, v0.6.0). 토스 연결 기능이 켜져 있으면 4단계(닉네임 · 약관 · 토스 안내 · 연결),
// 꺼져 있으면(기본, FR-006) 2단계(닉네임 1/2 · 약관 2/2) — DS18 Progress/Steps total={2}(aria "2단계 중 1단계").

/** 가입 단계(닉네임 1 · 약관 2) → ShellOnboarding progress · progressTotal */
export function signupProgress(step: 1 | 2, accountLink: boolean): { progress: ProgressStepsStep; progressTotal: ProgressStepsTotal } {
  return { progress: step, progressTotal: accountLink ? 4 : 2 }
}
