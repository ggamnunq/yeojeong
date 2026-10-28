// 결제내역이 쓰는 "지금"(타임라인 오늘 Day · 지금 노드). 운영은 기기 시각이다.
// 목 모드(개발 VITE_MOCK_API=1 · 테스트)에서는 features/payments/mocks.ts가 샘플 시점(MOCK_NOW, 11.13 18:34)으로 바꾼다.
export const clock = {
  now: (): number => Date.now(),
}
