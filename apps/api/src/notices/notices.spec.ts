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

  it('first notice: terms v1.0 published, from the effective date for 30 days', () => {
    expect(NOTICES[0]).toMatchObject({
      id: 'legal-v1.0-published',
      title: '서비스 이용약관과 개인정보처리방침을 게시했어요',
      url: '/terms',
    });
    expect(activeNotices(at('2026-10-29T23:59:59'))).toEqual([]);
    expect(activeNotices(at('2026-10-30T00:00:00')).map((n) => n.id)).toEqual([
      'legal-v1.0-published',
    ]);
    expect(activeNotices(at('2026-11-28T23:59:59'))).toHaveLength(1);
    expect(activeNotices(at('2026-11-29T00:00:00'))).toEqual([]);
    const days =
      (Date.parse(NOTICES[0].endsAt) - Date.parse(NOTICES[0].startsAt)) /
      86_400_000;
    expect(days).toBe(30);
  });

  it('keeps ids unique and urls in-app', () => {
    expect(new Set(NOTICES.map((n) => n.id)).size).toBe(NOTICES.length);
    for (const n of NOTICES) expect(n.url).toMatch(/^\/(?!\/)/);
  });
});
