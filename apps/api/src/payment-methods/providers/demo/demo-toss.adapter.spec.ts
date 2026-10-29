import { kstDateTime } from '../../kst.js';
import { isSafelyMasked } from '../../masking.js';
import { ProviderError } from '../payment-provider.adapter.js';
import { DemoTossAdapter, personaFor } from './demo-toss.adapter.js';

const anchor = '2026-11-12';
const adapter = new DemoTossAdapter(() => Promise.resolve(anchor));

async function connect(nickname: string) {
  const url = new URL(
    adapter.buildAuthorizeUrl({
      state: 'state-1',
      redirectUri:
        'http://localhost:5173/api/payment-connections/callback/toss',
      hint: { userId: `user-${nickname}`, nickname },
    }),
  );
  expect(url.searchParams.get('state')).toBe('state-1');
  return adapter.exchangeCode({
    code: url.searchParams.get('code')!,
    redirectUri: '',
  });
}

describe('DemoTossAdapter', () => {
  it('picks sample personas by nickname and a stable one otherwise', () => {
    expect(personaFor({ userId: 'u', nickname: '준용' })).toBe('junyong');
    expect(personaFor({ userId: 'x1' })).toBe(personaFor({ userId: 'x1' }));
  });

  it('authenticates immediately and returns masked methods only', async () => {
    const tokens = await connect('준용');
    const methods = await adapter.listPaymentMethods(tokens);
    expect(methods.map((m) => m.productName)).toEqual([
      '토스뱅크 통장',
      '토스뱅크 체크카드',
      '신한카드 Deep Dream',
      '카카오뱅크 세이프박스',
    ]);
    expect(methods.every((m) => isSafelyMasked(m.maskedNumber, m.type))).toBe(
      true,
    );
    expect(methods[1].linkedAccountRef).toBe(methods[0].ref);
    await expect(
      adapter.exchangeCode({ code: 'bogus', redirectUri: '' }),
    ).rejects.toBeInstanceOf(ProviderError);
  });

  it('generates deterministic transactions on the trip dates and honors the window', async () => {
    const tokens = await connect('준용');
    const [, check, shinhan] = await adapter.listPaymentMethods(tokens);
    const trip = {
      from: kstDateTime(anchor, 0, '00:00'),
      to: kstDateTime(anchor, 3, '23:59:59'),
    };
    const page = await adapter.listTransactions(tokens, {
      methodRef: check.ref,
      ...trip,
    });
    expect(page.items.map((t) => t.merchantName)).toEqual([
      '이치란 라멘 도톤보리점',
      '패밀리마트 난바역점',
      'MK택시',
      '551 호라이 난바본점',
    ]);
    const familymart = page.items[1];
    expect(familymart).toMatchObject({
      amount: '1280',
      currency: 'JPY',
      krwAmount: 11770,
    });
    expect(familymart.occurredAt.toISOString()).toBe(
      '2026-11-12T23:50:00.000Z',
    ); // 11.13 08:50 KST
    const again = await adapter.listTransactions(await connect('준용'), {
      methodRef: check.ref,
      ...trip,
    });
    expect(again.items.map((t) => t.ref)).toEqual(page.items.map((t) => t.ref));
    // 여정 전 결제는 기간 창에 없고 넓은 창에서만 나온다
    const shinhanInTrip = await adapter.listTransactions(tokens, {
      methodRef: shinhan.ref,
      ...trip,
    });
    expect(shinhanInTrip.items.map((t) => t.merchantName)).toEqual([
      '돈키호테 도톤보리점',
      '야키니쿠 와규 이치 난바점',
    ]);
    const before = await adapter.listTransactions(tokens, {
      methodRef: shinhan.ref,
      from: kstDateTime(anchor, -60, '00:00'),
      to: new Date(trip.from.getTime() - 1),
    });
    expect(before.items.map((t) => t.merchantName)).toEqual([
      '아고다',
      '제주항공 4매',
      'KKday',
      '인천공항 장기주차',
    ]);
  });

  it('includes the refund case with an approval ref', async () => {
    const tokens = await connect('태현');
    const [card] = await adapter.listPaymentMethods(tokens);
    const { items } = await adapter.listTransactions(tokens, {
      methodRef: card.ref,
      from: kstDateTime(anchor, 0, '00:00'),
      to: kstDateTime(anchor, 3, '23:59'),
    });
    const cancel = items.find((t) => t.kind === 'CANCEL')!;
    const original = items.find((t) => t.ref === cancel.approvalRef)!;
    expect(original).toMatchObject({
      merchantName: '오사카 주유패스 4매',
      krwAmount: 121330,
    });
  });

  it('rejects unknown tokens as expired', async () => {
    await expect(
      adapter.listPaymentMethods({ accessToken: 'nope' }),
    ).rejects.toThrow(ProviderError);
    await expect(
      adapter.refreshTokens({ accessToken: 'nope' }),
    ).rejects.toMatchObject({ code: 'AUTH_EXPIRED' });
  });
});
