import {
  LEGAL_DOCUMENT_VERSIONS,
  LEGAL_RELEASES,
  type NoticeView,
} from '@yeojeong/shared';

/**
 * 서비스 공지(Q-57 · 약관 제3조③ 개정 예고 · 처리방침 제14조② 변경 알림 · 장기 미이용 안내 등 "서비스 화면 게시").
 * 정적 목록이다 — 공지를 올리거나 내리려면 이 파일을 고쳐 배포한다(git 이력 = 게시 기록). 지운 공지는 다시 쓰지 않는다.
 * id는 바꾸지 않는다(화면이 닫음을 id로 기억한다). 문구를 크게 고쳐 다시 보이게 하려면 새 id로 추가한다.
 * 시각은 KST로 적는다. 끝(endsAt)은 포함하지 않는다.
 * 화면은 닫지 않은 것 중 하나만 보인다(최신 = startsAt 늦은 것, 같으면 이 목록에서 뒤에 적은 것).
 */
export interface NoticeDefinition {
  id: string;
  title: string;
  url: string;
  startsAt: string;
  endsAt: string;
  /** 이 시각(포함)부터는 url 대신 이 주소로 보낸다 — 예정본 미리 보기(?v=) → 시행 뒤 현행 주소 */
  urlFrom?: { at: string; url: string };
}

const kstMidnight = (date: string) => `${date}T00:00:00+09:00`;
const addDays = (date: string, days: number) => {
  const d = new Date(`${date}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
};
/** 약관 0.2 게시일(머지하는 날, docs/legal/releases.json → packages/shared legal-manifest.ts) */
const V02_PUBLISHED = LEGAL_RELEASES.find((r) => r.dir === 'v0.2')?.published;
/** 이용약관 0.2 시행일(게시일 + 7일) */
const TERMS_02 = LEGAL_DOCUMENT_VERSIONS['terms.md']?.find(
  (v) => v.version === '0.2',
);
/** 처리방침 0.3 게시일과 시행일(문서 부칙) */
const V03_PUBLISHED = LEGAL_RELEASES.find((r) => r.dir === 'v0.3')?.published;
const PRIVACY_03 = LEGAL_DOCUMENT_VERSIONS['privacy.md']?.find(
  (v) => v.version === '0.3',
);
/** 11-06 → "11.06" */
const mmdd = (date: string) => date.slice(5).replace('-', '.');
const earlier = (a: string, b: string) => (a < b ? a : b);

export const NOTICES: readonly NoticeDefinition[] = [
  {
    // 정식 약관(게시 당시 1.0 = 0.1) 게시(L-1). 시행일 2026-10-30부터 — 0.2 공지가 시작하면 내린다(같은 문서의 새 판 안내로 넘어감)
    id: 'legal-v1.0-published',
    title: '서비스 이용약관과 개인정보처리방침을 게시했어요',
    url: '/terms',
    startsAt: '2026-10-30T00:00:00+09:00',
    endsAt:
      V02_PUBLISHED && kstMidnight(V02_PUBLISHED) < '2026-11-29T00:00:00+09:00'
        ? kstMidnight(V02_PUBLISHED)
        : '2026-11-29T00:00:00+09:00',
  },
  ...(V02_PUBLISHED
    ? [
        {
          // 약관 0.2 — 처리방침·수집이용 동의서·처리위탁 고지 정정 + 카드 불러오기(게시일 즉시 시행). 게시일부터 14일
          id: 'legal-v0.2-privacy',
          title: '개인정보처리방침을 바로잡고 카드 불러오기 안내를 더했어요',
          url: '/privacy',
          startsAt: kstMidnight(V02_PUBLISHED),
          endsAt: kstMidnight(addDays(V02_PUBLISHED, 14)),
        },
      ]
    : []),
  ...(V02_PUBLISHED && TERMS_02
    ? [
        {
          // 이용약관 0.2(게시일 + 7일 시행, 약관 제3조③ 7일 전 공지). 시행일 하루 끝까지. 시작이 위 공지와 같아 뒤에 적은 이 공지가 먼저 보인다
          id: 'legal-v0.2-terms',
          title: `이용약관이 바뀌어요 · ${TERMS_02.effectiveDate.slice(5).replace('-', '.')}부터`,
          url: '/terms?v=0.2',
          startsAt: kstMidnight(V02_PUBLISHED),
          // 처리방침 0.3 공지가 시작하면 아래 "합친 공지"로 바꾼다(한 번에 하나라 두 법정 사전 공지를 한 줄로)
          endsAt: earlier(
            kstMidnight(addDays(TERMS_02.effectiveDate, 1)),
            V03_PUBLISHED ? kstMidnight(V03_PUBLISHED) : '9999-12-31',
          ),
        },
      ]
    : []),
  ...(V03_PUBLISHED && PRIVACY_03 && TERMS_02
    ? [
        {
          // 이용약관 0.2 시행 예고 + 처리방침 0.3 시행 예고(둘 다 법정 사전 공지). 이용약관 시행 전날까지.
          // 시작이 처리방침 0.2 정정 공지와 같으면 뒤에 적은 이 공지가 먼저 보인다(법정 사전 공지 우선)
          id: 'legal-v0.3-combined',
          title: `이용약관(${mmdd(TERMS_02.effectiveDate)})·개인정보처리방침(${mmdd(PRIVACY_03.effectiveDate)})이 바뀌어요`,
          url: '/privacy?v=0.3',
          startsAt: kstMidnight(V03_PUBLISHED),
          endsAt: kstMidnight(TERMS_02.effectiveDate),
        },
        {
          // 처리방침 0.3(MINOR, 재동의 없음): 이용약관 시행일부터 처리방침 시행 후 7일까지. 시작이 늦어 처리방침 0.2 정정 공지보다 먼저 보인다.
          // 시행 전에는 예정본(?v=0.3), 시행 뒤에는 현행 주소
          id: 'legal-v0.3-privacy',
          title: `개인정보처리방침 일부가 바뀌어요 · ${mmdd(PRIVACY_03.effectiveDate)}부터`,
          url: '/privacy?v=0.3',
          urlFrom: {
            at: kstMidnight(PRIVACY_03.effectiveDate),
            url: '/privacy',
          },
          startsAt: kstMidnight(TERMS_02.effectiveDate),
          endsAt: kstMidnight(addDays(PRIVACY_03.effectiveDate, 7)),
        },
      ]
    : []),
];

/** 지금 게시 중인 공지, 최신(startsAt 늦은 것, 같으면 목록에서 뒤에 적은 것)부터 */
export function activeNotices(
  now: Date,
  notices: readonly NoticeDefinition[] = NOTICES,
): NoticeView[] {
  const t = now.getTime();
  return notices
    .map((n, order) => ({
      order,
      view: {
        id: n.id,
        title: n.title,
        url: n.urlFrom && Date.parse(n.urlFrom.at) <= t ? n.urlFrom.url : n.url,
        startsAt: new Date(n.startsAt).toISOString(),
        endsAt: new Date(n.endsAt).toISOString(),
      },
    }))
    .filter(
      ({ view }) =>
        Date.parse(view.startsAt) <= t && t < Date.parse(view.endsAt),
    )
    .sort(
      (a, b) =>
        Date.parse(b.view.startsAt) - Date.parse(a.view.startsAt) ||
        b.order - a.order,
    )
    .map(({ view }) => view);
}
