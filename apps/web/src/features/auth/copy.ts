// 인증 플로우 문구. 화면명세 0-9 · copy_changes.md 확정 문구 그대로, (제안)은 화면명세가 정한 것.

export const COPY = {
  /**
   * HF-02 가치 제안 한 줄. 하이파이(direction §8)·DS Logo/Lockup 문구를 따랐다.
   * 화면명세 0-9 WF-02는 "여행 결제는 각자, 정산은 한 번에"(와이어프레임 문구) — 확정되면 여기 한 줄만 바꾼다.
   */
  tagline: '함께 쓰고, 정확히 나누는 여행 공동 지갑',
  /** HF-62b: QR·공유 링크로 들어와 초대가 보관돼 있을 때 카카오 버튼 위 Caption(W8) */
  invited: '초대받은 여정이 있어요',
  /** 오류 토스트(제안) */
  retryLater: '잠시 후 다시 시도해 주세요',

  nicknameTitle: '닉네임을 알려 주세요',
  nicknameHelper: (length: number, max: number) => `중복 가능 · ${length}/${max}`,
  next: '다음',

  termsTitle: '약관에 동의해 주세요',
  privacyLink: '개인정보처리방침',

  walletTitle: '토스 지갑을 연결해 주세요',
  readOnly: '조회 전용',
  privatePayments: '내 결제는 비공개',
  connectToss: '토스로 연결',
  later: '나중에',

  finConsentTitle: '금융정보 연동 동의',
  agreeAndConnect: '동의하고 연결',

  /** 재동의(부록 C-14, 제안) */
  reconsentTitle: '약관이 바뀌었어요',
  agree: '동의',
  logout: '로그아웃',
  withdraw: '탈퇴',
  loadFailed: '불러오지 못했어요',
  retry: '다시 시도',
} as const
