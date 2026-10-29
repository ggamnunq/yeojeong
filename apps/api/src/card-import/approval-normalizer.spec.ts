import { createHmac } from 'node:crypto';
import {
  DOC_SAMPLE_ROW,
  SANDBOX_APPROVAL_RESPONSE,
  mixedRows,
} from '../../test/fixtures/codef-approvals.js';
import {
  approvalRowsOf,
  merchantNameFor,
  normalizeApprovals,
} from './approval-normalizer.js';

const keyFn = (material: string) =>
  createHmac('sha256', 'test-key').update(material).digest('hex');
const ctx = { userId: 'user-1', organization: '0306', keyFn };

describe('normalizeApprovals (KR_CD_P_002 → 화면 줄)', () => {
  it('maps the documented sample to minimal fields only', () => {
    const { items, dropped } = normalizeApprovals([DOC_SAMPLE_ROW], ctx);
    expect(dropped).toBe(0);
    expect(items).toHaveLength(1);
    const [item] = items;
    expect(item).toMatchObject({
      approvedAt: new Date('2019-06-20T12:01:17+09:00'),
      amount: '22000',
      currency: 'KRW',
      krwAmount: 22000,
      merchantName: '온라인예매',
      overseas: false,
      cardLast4: '0000',
      cardName: null,
      cancelState: 'NONE',
      partialCancelAmount: null,
    });
    expect(item.importKey).toMatch(/^[0-9a-f]{64}$/);
    // 승인번호·카드번호 전체·주소·가맹점 번호는 어디에도 실리지 않는다
    const out = JSON.stringify(items);
    for (const secret of ['69331111', '5361481234560000', '서울시', '158364905']) {
      expect(out).not.toContain(secret);
    }
  });

  it('gives the same importKey for the same approval and differs per user', () => {
    const a = normalizeApprovals([DOC_SAMPLE_ROW], ctx).items[0].importKey;
    const b = normalizeApprovals([{ ...DOC_SAMPLE_ROW }], ctx).items[0].importKey;
    const other = normalizeApprovals([DOC_SAMPLE_ROW], { ...ctx, userId: 'user-2' })
      .items[0].importKey;
    expect(a).toBe(b);
    expect(other).not.toBe(a);
  });

  it('drops masked sandbox rows and accepts a single-object data', () => {
    const rows = approvalRowsOf(SANDBOX_APPROVAL_RESPONSE.data);
    expect(rows).toHaveLength(1);
    expect(normalizeApprovals(rows, ctx)).toEqual({ items: [], dropped: 1 });
    expect(approvalRowsOf({})).toEqual([]);
    expect(approvalRowsOf(null)).toEqual([]);
    expect(approvalRowsOf([DOC_SAMPLE_ROW, 'x'])).toHaveLength(1);
  });

  it('pairs cancellations by card + approval number', () => {
    const { items } = normalizeApprovals(mixedRows('2026-11-13'), ctx);
    const byMerchant = (name: string) => items.filter((i) => i.merchantName === name);

    // 해외: 원통화 + 카드사 원화, 가맹점 이름 정리
    expect(byMerchant('이치란 라멘 도톤보리점')).toEqual([
      expect.objectContaining({
        amount: '2860',
        currency: 'JPY',
        krwAmount: 26290,
        overseas: true,
        cancelState: 'NONE',
        cardLast4: '1934',
        cardName: '테스트 체크카드',
      }),
    ]);
    // 전액 취소: CANCELLED
    expect(byMerchant('편의점')).toEqual([
      expect.objectContaining({ cancelState: 'CANCELLED', amount: '15000' }),
    ]);
    // 부분 취소: 승인 한 줄로 합쳐 순액
    expect(byMerchant('면세점')).toEqual([
      expect.objectContaining({
        cancelState: 'PARTIAL',
        amount: '18000',
        partialCancelAmount: '12000',
        krwAmount: 18000,
      }),
    ]);
    // 원 승인 없는 취소
    expect(byMerchant('카페')).toEqual([
      expect.objectContaining({ cancelState: 'ORPHAN_CANCEL', amount: '5000' }),
    ]);
    // 거절은 빠진다
    expect(byMerchant('거절된 가맹점')).toEqual([]);
    // 최신순
    const times = items.map((i) => i.approvedAt.getTime());
    expect([...times].sort((a, b) => b - a)).toEqual(times);
  });

  it('marks a full cancel slip as CANCELLED on both rows', () => {
    const { items } = normalizeApprovals(
      [
        { ...DOC_SAMPLE_ROW, resUsedAmount: '22000' },
        { ...DOC_SAMPLE_ROW, resUsedTime: '130000', resUsedAmount: '-22000' },
      ],
      ctx,
    );
    expect(items.map((i) => i.cancelState)).toEqual(['CANCELLED', 'CANCELLED']);
    expect(new Set(items.map((i) => i.importKey)).size).toBe(2);
  });

  it('uses resCancelAmount for partial cancels without a slip and does not double count', () => {
    const base = { ...DOC_SAMPLE_ROW, resCancelYN: '2', resCancelAmount: '2000' };
    expect(normalizeApprovals([base], ctx).items[0]).toMatchObject({
      cancelState: 'PARTIAL',
      amount: '20000',
      partialCancelAmount: '2000',
    });
    const withSlip = normalizeApprovals(
      [base, { ...DOC_SAMPLE_ROW, resUsedTime: '130000', resUsedAmount: '-2000' }],
      ctx,
    ).items;
    expect(withSlip).toHaveLength(1);
    expect(withSlip[0]).toMatchObject({ amount: '20000', partialCancelAmount: '2000' });
  });

  it('drops rows with unreadable dates or amounts', () => {
    const { items, dropped } = normalizeApprovals(
      [
        { ...DOC_SAMPLE_ROW, resUsedDate: '20190230' },
        { ...DOC_SAMPLE_ROW, resUsedAmount: '12,3a' },
        { ...DOC_SAMPLE_ROW, resUsedAmount: '0' },
      ],
      ctx,
    );
    expect(items).toEqual([]);
    expect(dropped).toBe(3);
  });

  it('cleans merchant names to the 40-character wallet rule', () => {
    expect(merchantNameFor('')).toBe('결제');
    expect(merchantNameFor(' a\tb\n c ')).toBe('a b c');
    const long = '가'.repeat(45);
    expect(merchantNameFor(long)).toBe('가'.repeat(40));
    expect([...merchantNameFor('👍'.repeat(41))]).toHaveLength(40);
  });
});
