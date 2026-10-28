// 마이페이지 응답 타입(기능명세 6-3 "인증·사용자").
// TODO(shared): 서버(S1)가 @yeojeong/shared에 DeletionRequestResponse를 넣으면 re-export로 바꾼다.

/** POST /api/users/me/deletion-request (FR-108) */
export interface DeletionRequestResponse {
  /** "YJD-XXXX-XXXX-XXXX". 본인 확인 수단이라 화면 밖(로그·저장소)에 남기지 않는다 */
  code: string
  /** 24시간 뒤 */
  expiresAt: string
  mail: { to: string; subject: string; body: string }
  /** mailto:고객센터?subject=…&body=… */
  mailto: string
}
