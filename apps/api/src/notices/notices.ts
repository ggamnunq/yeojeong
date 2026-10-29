import type { NoticeView } from '@yeojeong/shared';

/**
 * 서비스 공지(Q-57 · 약관 제3조③ 개정 예고 · 처리방침 제14조② 변경 알림 · 장기 미이용 안내 등 "서비스 화면 게시").
 * 정적 목록이다 — 공지를 올리거나 내리려면 이 파일을 고쳐 배포한다(git 이력 = 게시 기록). 지운 공지는 다시 쓰지 않는다.
 * id는 바꾸지 않는다(화면이 닫음을 id로 기억한다). 문구를 크게 고쳐 다시 보이게 하려면 새 id로 추가한다.
 * 시각은 KST로 적는다. 끝(endsAt)은 포함하지 않는다.
 */
export interface NoticeDefinition {
  id: string;
  title: string;
  url: string;
  startsAt: string;
  endsAt: string;
}

export const NOTICES: readonly NoticeDefinition[] = [
  {
    // 정식 약관 v1.0 게시(L-1). 시행일 2026-10-30부터 30일
    id: 'legal-v1.0-published',
    title: '서비스 이용약관과 개인정보처리방침을 게시했어요',
    url: '/terms',
    startsAt: '2026-10-30T00:00:00+09:00',
    endsAt: '2026-11-29T00:00:00+09:00',
  },
];

/** 지금 게시 중인 공지, 최신(startsAt 늦은 것)부터 */
export function activeNotices(
  now: Date,
  notices: readonly NoticeDefinition[] = NOTICES,
): NoticeView[] {
  const t = now.getTime();
  return notices
    .map((n) => ({
      id: n.id,
      title: n.title,
      url: n.url,
      startsAt: new Date(n.startsAt).toISOString(),
      endsAt: new Date(n.endsAt).toISOString(),
    }))
    .filter((n) => Date.parse(n.startsAt) <= t && t < Date.parse(n.endsAt))
    .sort((a, b) => Date.parse(b.startsAt) - Date.parse(a.startsAt));
}
