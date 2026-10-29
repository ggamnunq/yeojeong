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

  const published03 = LEGAL_RELEASES.find((r) => r.dir === 'v0.3')?.published;
  const privacy03 = LEGAL_DOCUMENT_VERSIONS['privacy.md'].find(
    (v) => v.version === '0.3',
  );
  const mmdd = (date: string) => `${date.slice(5, 7)}.${date.slice(8)}`;

  it.runIf(terms02)(
    '0.2 terms notice: from the publish date through the effective day (7 days ahead) — replaced by the combined notice once 0.3 is published',
    () => {
      const effective = terms02!.effectiveDate;
      expect(effective).toBe(plus(published, 7));
      const notice = NOTICES.find((n) => n.id === 'legal-v0.2-terms')!;
      const end = [plus(effective, 1), published03 ?? '9999-12-31'].sort(
        (a, b) => a.localeCompare(b),
      )[0];
      expect(notice).toEqual({
        id: 'legal-v0.2-terms',
        title: `이용약관이 바뀌어요 · ${mmdd(effective)}부터`,
        url: '/terms?v=0.2',
        startsAt: `${published}T00:00:00+09:00`,
        endsAt: `${end}T00:00:00+09:00`,
      });
      expect(notice.title.length).toBeLessThanOrEqual(40);
    },
  );

  it.runIf(terms02 && privacy03 && published03)(
    '0.3: combined advance notice until the terms take effect, then privacy-only until 7 days after; statutory advance notices outrank the 0.2 correction notice',
    () => {
      const termsAt = terms02!.effectiveDate;
      const privacyAt = privacy03!.effectiveDate;
      const combined = NOTICES.find((n) => n.id === 'legal-v0.3-combined')!;
      expect(combined).toEqual({
        id: 'legal-v0.3-combined',
        title: `이용약관(${mmdd(termsAt)})·개인정보처리방침(${mmdd(privacyAt)})이 바뀌어요`,
        url: '/privacy?v=0.3',
        startsAt: `${published03}T00:00:00+09:00`,
        endsAt: `${termsAt}T00:00:00+09:00`,
      });
      expect(combined.title.length).toBeLessThanOrEqual(40);
      const only = NOTICES.find((n) => n.id === 'legal-v0.3-privacy')!;
      expect(only).toEqual({
        id: 'legal-v0.3-privacy',
        title: `개인정보처리방침 일부가 바뀌어요 · ${mmdd(privacyAt)}부터`,
        url: '/privacy?v=0.3',
        urlFrom: { at: `${privacyAt}T00:00:00+09:00`, url: '/privacy' },
        startsAt: `${termsAt}T00:00:00+09:00`,
        endsAt: `${plus(privacyAt, 7)}T00:00:00+09:00`,
      });
      // 처리방침 시행 7일 전부터 알린다(제14조②)
      expect(published03! <= plus(privacyAt, -7)).toBe(true);

      const first = (iso: string) => activeNotices(at(iso))[0];
      // 게시일 ~ 이용약관 시행 전날: 합친 공지(예정본), 처리방침 0.2 정정 공지는 그다음
      for (const when of [
        `${published03}T00:00:00`,
        `${plus(termsAt, -1)}T23:59:59`,
      ]) {
        expect(first(when), when).toMatchObject({
          id: 'legal-v0.3-combined',
          url: '/privacy?v=0.3',
        });
        expect(ids(when)).not.toContain('legal-v0.2-terms');
      }
      // 이용약관 시행일: 처리방침만(예정본)
      expect(first(`${termsAt}T00:00:00`)).toMatchObject({
        id: 'legal-v0.3-privacy',
        url: '/privacy?v=0.3',
      });
      expect(first(`${plus(privacyAt, -1)}T23:59:59`)).toMatchObject({
        id: 'legal-v0.3-privacy',
        url: '/privacy?v=0.3',
      });
      // 처리방침 시행부터는 현행 주소, 시행 후 7일까지
      expect(first(`${privacyAt}T00:00:00`)).toMatchObject({
        id: 'legal-v0.3-privacy',
        url: '/privacy',
      });
      expect(ids(`${plus(privacyAt, 6)}T23:59:59`)[0]).toBe(
        'legal-v0.3-privacy',
      );
      expect(ids(`${plus(privacyAt, 7)}T00:00:00`)).not.toContain(
        'legal-v0.3-privacy',
      );
      // 법정 사전 공지가 처리방침 0.2 정정 공지보다 먼저 — 정정 공지는 남아 있으면 다음 차례
      expect(ids(`${termsAt}T12:00:00`)).toEqual(
        ['legal-v0.3-privacy', 'legal-v0.2-privacy'].filter((id) =>
          id === 'legal-v0.2-privacy'
            ? `${termsAt}` < plus(published, 14)
            : true,
        ),
      );
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
