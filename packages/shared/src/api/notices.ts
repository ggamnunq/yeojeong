/** GET /api/notices/active 한 건(서비스 공지, Q-57). 공지 목록은 API 코드(src/notices/notices.ts)에 있고 git 이력이 게시를 입증한다 */
export interface NoticeView {
  /** 바뀌지 않는 이름. 화면이 "닫음"을 이 id로 기억한다 */
  id: string;
  /** 배너 한 줄 */
  title: string;
  /** 누르면 여는 주소. 앱 안 경로(/terms 등) */
  url: string;
  /** 게시 시작(포함, ISO 8601 UTC) */
  startsAt: string;
  /** 게시 끝(포함하지 않음, ISO 8601 UTC) */
  endsAt: string;
}

/** 지금 게시 중인 공지. 최신(startsAt 늦은 것)부터. 화면은 닫지 않은 것 중 첫 번째 하나만 보인다 */
export interface ActiveNoticesResponse {
  items: NoticeView[];
}
