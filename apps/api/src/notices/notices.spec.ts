import { LEGAL_DOCUMENT_VERSIONS, LEGAL_RELEASES } from '@yeojeong/shared';
import { activeNotices, NOTICES, type NoticeDefinition } from './notices.js';

const at = (iso: string) => new Date(`${iso}+09:00`);
const sample: NoticeDefinition[] = [
  {
    id: 'old',
    title: '옛 공지',
    url: '/terms',
    startsAt: '2026-10-01T00:00:00+09:00',
    endsAt: '2026-11-01T00:00:00+09:00',
  },
  {
    id: 'new',
    title: '새 공지',
    url: '/privacy',
    startsAt: '2026-10-20T00:00:00+09:00',
    endsAt: '2026-10-31T00:00:00+09:00',
  },
];

describe('notices', () => {
  it('returns notices in their period, newest first (end excluded)', () => {
    expect(
      activeNotices(at('2026-10-25T00:00:00'), sample).map((n) => n.id),
    ).toEqual(['new', 'old']);
    expect(
      activeNotices(at('2026-10-31T00:00:00'), sample).map((n) => n.id),
    ).toEqual(['old']);
    expect(activeNotices(at('2026-09-30T23:59:59'), sample)).toEqual([]);
    expect(activeNotices(at('2026-11-01T00:00:00'), sample)).toEqual([]);
  });

  it('serves times as UTC ISO strings', () => {
    expect(activeNotices(at('2026-10-25T00:00:00'), sample)[1]).toEqual({
      id: 'old',
      title: '옛 공지',
      url: '/terms',
      startsAt: '2026-09-30T15:00:00.000Z',
      endsAt: '2026-10-31T15:00:00.000Z',
    });
  });

  // 0.2 게시일(머지하는 날)과 이용약관 0.2 시행일은 manifest(docs/legal/releases.json)에서 온다 — 기대값도 거기서 계산한다
  const published = LEGAL_RELEASES.find((r) => r.dir === 'v0.2')!.published;
  const terms02 = LEGAL_DOCUMENT_VERSIONS['terms.md'].find(
    (v) => v.version === '0.2',
  );
  const plus = (date: string, days: number) => {
    const d = new Date(`${date}T00:00:00Z`);
    d.setUTCDate(d.getUTCDate() + days);
    return d.toISOString().slice(0, 10);
  };
  const ids = (iso: string) => activeNotices(at(iso)).map((n) => n.id);

  it('first notice: terms (published as 1.0) from 2026-10-30 until the 0.2 notices start (at most 30 days)', () => {
    expect(NOTICES[0]).toMatchObject({
      id: 'legal-v1.0-published',
      title: '서비스 이용약관과 개인정보처리방침을 게시했어요',
      url: '/terms',
      startsAt: '2026-10-30T00:00:00+09:00',
    });
    expect(activeNotices(at('2026-10-29T23:59:59'))).toEqual([]);
    const end = published < '2026-11-29' ? published : '2026-11-29';
    expect(NOTICES[0].endsAt).toBe(`${end}T00:00:00+09:00`);
    if (end > '2026-10-30') {
      expect(ids('2026-10-30T00:00:00')).toEqual(['legal-v1.0-published']);
    }
    expect(ids(`${end}T00:00:00`)).not.toContain('legal-v1.0-published');
  });

  it('0.2 privacy notice: from the publish date for 14 days, links /privacy', () => {
    expect(NOTICES.find((n) => n.id === 'legal-v0.2-privacy')).toEqual({
      id: 'legal-v0.2-privacy',
      title: '개인정보처리방침을 바로잡고 카드 불러오기 안내를 더했어요',
      url: '/privacy',
      startsAt: `${published}T00:00:00+09:00`,
      endsAt: `${plus(published, 14)}T00:00:00+09:00`,
    });
    expect(ids(`${plus(published, -1)}T23:59:59`)).not.toContain(
      'legal-v0.2-privacy',
    );
    expect(ids(`${plus(published, 13)}T23:59:59`)).toContain(
      'legal-v0.2-privacy',
    );
    expect(ids(`${plus(published, 14)}T00:00:00`)).not.toContain(
      'legal-v0.2-privacy',
    );
  });

  it.runIf(terms02)(
    '0.2 terms notice: from the publish date through the effective day (7 days ahead), shown first while active',
    () => {
      const effective = terms02!.effectiveDate;
      expect(effective).toBe(plus(published, 7));
      const notice = NOTICES.find((n) => n.id === 'legal-v0.2-terms')!;
      expect(notice).toEqual({
        id: 'legal-v0.2-terms',
        title: `이용약관이 바뀌어요 · ${effective.slice(5, 7)}.${effective.slice(8)}부터`,
        url: '/terms?v=0.2',
        startsAt: `${published}T00:00:00+09:00`,
        endsAt: `${plus(effective, 1)}T00:00:00+09:00`,
      });
      expect(notice.title.length).toBeLessThanOrEqual(40);
      // 한 번에 하나 — 시행 전(시행일 포함)에는 이용약관 공지가 먼저
      for (const when of [
        `${published}T00:00:00`,
        `${plus(effective, -1)}T23:59:59`,
        `${effective}T23:59:59`,
      ]) {
        expect(ids(when)[0], when).toBe('legal-v0.2-terms');
        expect(ids(when)).toContain('legal-v0.2-privacy');
      }
      expect(ids(`${plus(effective, 1)}T00:00:00`)).toEqual([
        'legal-v0.2-privacy',
      ]);
    },
  );

  it('breaks a start-time tie by list order: the later entry is newer', () => {
    const tie: NoticeDefinition[] = [
      { ...sample[0], id: 'first', startsAt: '2026-10-20T00:00:00+09:00' },
      { ...sample[1], id: 'second' },
    ];
    expect(
      activeNotices(at('2026-10-25T00:00:00'), tie).map((n) => n.id),
    ).toEqual(['second', 'first']);
  });

  it('keeps ids unique and urls in-app', () => {
    expect(new Set(NOTICES.map((n) => n.id)).size).toBe(NOTICES.length);
    for (const n of NOTICES) expect(n.url).toMatch(/^\/(?!\/)/);
  });
});
