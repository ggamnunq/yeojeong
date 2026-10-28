import { splitEvenly } from '@yeojeong/shared';
import {
  computeSettlement,
  divRoundHalfUp,
  greedyTransfers,
  SettlementImbalanceError,
  settlementDirection,
  type SettlementExpenseInput,
  type SettlementMemberInput,
} from './compute.js';

const JUNYONG = 'm-junyong';
const MINJI = 'm-minji';
const TAEHYUN = 'm-taehyun';
const SUBIN = 'm-subin';

const MEMBERS: SettlementMemberInput[] = [
  { membershipId: JUNYONG, joinOrder: 1, isLeft: false },
  { membershipId: MINJI, joinOrder: 2, isLeft: false },
  { membershipId: TAEHYUN, joinOrder: 3, isLeft: false },
  { membershipId: SUBIN, joinOrder: 4, isLeft: false },
];
const ALL = MEMBERS.map(({ membershipId, joinOrder }) => ({
  membershipId,
  joinOrder,
}));

function shared(
  payer: string,
  netKrw: number,
  participants = ALL,
): SettlementExpenseInput {
  return {
    payerMembershipId: payer,
    netKrw,
    shares: splitEvenly(netKrw, participants, payer).shares,
  };
}

// 기능명세 4-4 샘플(종료 후, 공동 11건)
const SAMPLE: SettlementExpenseInput[] = [
  shared(JUNYONG, 36_400), // 이치란
  shared(JUNYONG, 26_290, ALL.slice(0, 2)), // MK택시, 준용·민지
  shared(JUNYONG, 25_740), // 551 호라이
  shared(JUNYONG, 227_960), // 야키니쿠
  shared(MINJI, 54_780), // 난카이
  shared(MINJI, 73_540), // 우메다
  shared(MINJI, 58_640), // 보테쥬
  shared(TAEHYUN, 117_660), // 쿠시카츠
  shared(TAEHYUN, 73_540), // 하루카스
  shared(SUBIN, 44_120), // 오사카성
  shared(SUBIN, 88_240), // 쿠로몬
];

const net = (result: ReturnType<typeof computeSettlement>, id: string) =>
  result.members.find((m) => m.membershipId === id)?.netKrw;

describe('computeSettlement', () => {
  it('reproduces the spec sample (4-4)', () => {
    const result = computeSettlement({
      members: MEMBERS,
      sharedExpenses: SAMPLE,
    });

    expect(result.totalSharedKrw).toBe(826_910);
    expect(result.sharedCount).toBe(11);
    expect(result.memberCount).toBe(4);
    expect(result.perCapitaKrw).toBe(206_728); // round(206,727.5)
    expect(result.members).toEqual([
      expect.objectContaining({
        membershipId: JUNYONG,
        paidKrw: 316_390,
        paidCount: 4,
        burdenKrw: 213_300,
        netKrw: 103_090,
      }),
      expect.objectContaining({
        membershipId: MINJI,
        paidKrw: 186_960,
        paidCount: 3,
        burdenKrw: 213_300,
        netKrw: -26_340,
      }),
      expect.objectContaining({
        membershipId: TAEHYUN,
        paidKrw: 191_200,
        paidCount: 2,
        burdenKrw: 200_155,
        netKrw: -8_955,
      }),
      expect.objectContaining({
        membershipId: SUBIN,
        paidKrw: 132_360,
        paidCount: 2,
        burdenKrw: 200_155,
        netKrw: -67_795,
      }),
    ]);
    expect(result.members.reduce((s, m) => s + m.netKrw, 0)).toBe(0);
    // FR-704 수락 기준 1
    expect(result.transfers).toEqual([
      {
        seq: 1,
        fromMembershipId: SUBIN,
        toMembershipId: JUNYONG,
        amountKrw: 67_795,
      },
      {
        seq: 2,
        fromMembershipId: MINJI,
        toMembershipId: JUNYONG,
        amountKrw: 26_340,
      },
      {
        seq: 3,
        fromMembershipId: TAEHYUN,
        toMembershipId: JUNYONG,
        amountKrw: 8_955,
      },
    ]);
  });

  it('keeps a left member who paid or shared, with the same numbers (FR-705, WF-44)', () => {
    const members = MEMBERS.map((m) =>
      m.membershipId === SUBIN ? { ...m, isLeft: true } : m,
    );
    const result = computeSettlement({ members, sharedExpenses: SAMPLE });
    expect(result.memberCount).toBe(4);
    expect(net(result, SUBIN)).toBe(-67_795);
    expect(result.members.find((m) => m.membershipId === SUBIN)?.isLeft).toBe(
      true,
    );
    expect(result.perCapitaKrw).toBe(206_728);
  });

  it('drops a left member with no payments or shares from the list and from N (FR-705 #2)', () => {
    const members = [
      ...MEMBERS,
      { membershipId: 'm-left', joinOrder: 5, isLeft: true },
    ];
    const result = computeSettlement({ members, sharedExpenses: SAMPLE });
    expect(result.memberCount).toBe(4);
    expect(result.members.map((m) => m.membershipId)).not.toContain('m-left');
  });

  it('keeps an active member with nothing to settle in N', () => {
    const members = [
      ...MEMBERS,
      { membershipId: 'm-quiet', joinOrder: 5, isLeft: false },
    ];
    const result = computeSettlement({ members, sharedExpenses: SAMPLE });
    expect(result.memberCount).toBe(5);
    expect(net(result, 'm-quiet')).toBe(0);
    expect(result.perCapitaKrw).toBe(165_382); // round(165,382)
  });

  it('charges the remainder to the payer through the stored shares (4-3)', () => {
    // MK택시 ₩26,290을 4명이 나누면 1인 6,572, 결제자 +2원
    const taxi = shared(JUNYONG, 26_290);
    expect(taxi.shares.find((s) => s.membershipId === JUNYONG)?.amountKrw).toBe(
      6_574,
    );
    const result = computeSettlement({
      members: MEMBERS,
      sharedExpenses: [taxi],
    });
    expect(
      result.members.map((m) => [m.membershipId, m.burdenKrw, m.netKrw]),
    ).toEqual([
      [JUNYONG, 6_574, 19_716],
      [MINJI, 6_572, -6_572],
      [TAEHYUN, 6_572, -6_572],
      [SUBIN, 6_572, -6_572],
    ]);
  });

  it('gives the remainder to the first joined participant when the payer is not sharing (Q-08)', () => {
    const expense = shared(SUBIN, 10_001, ALL.slice(0, 3));
    const result = computeSettlement({
      members: MEMBERS,
      sharedExpenses: [expense],
    });
    expect(
      result.members.find((m) => m.membershipId === JUNYONG)?.burdenKrw,
    ).toBe(3_335);
    expect(net(result, SUBIN)).toBe(10_001);
    expect(result.members.reduce((s, m) => s + m.netKrw, 0)).toBe(0);
  });

  it('counts a fully refunded bundle as one shared payment of ₩0', () => {
    const result = computeSettlement({
      members: MEMBERS,
      sharedExpenses: [shared(MINJI, 0)],
    });
    expect(result.sharedCount).toBe(1);
    expect(
      result.members.find((m) => m.membershipId === MINJI)?.paidCount,
    ).toBe(1);
    expect(result.transfers).toEqual([]); // FR-704 수락 기준 2
    expect(result.perCapitaKrw).toBe(0);
  });

  it('rounds the per-capita amount half-up', () => {
    const two = MEMBERS.slice(0, 2);
    const result = computeSettlement({
      members: two,
      sharedExpenses: [shared(JUNYONG, 5, ALL.slice(0, 2))],
    });
    expect(result.perCapitaKrw).toBe(3); // 2.5 → 3
  });

  it('carries personal counts without using them in the math', () => {
    const members = MEMBERS.map((m) => ({ ...m, personalCount: m.joinOrder }));
    const result = computeSettlement({ members, sharedExpenses: SAMPLE });
    expect(result.members.map((m) => m.personalCount)).toEqual([1, 2, 3, 4]);
    expect(net(result, JUNYONG)).toBe(103_090);
  });

  it('throws when the nets do not add up to zero, unless asked not to (I-7)', () => {
    const broken: SettlementExpenseInput = {
      payerMembershipId: JUNYONG,
      netKrw: 10_000,
      shares: [{ membershipId: MINJI, amountKrw: 9_000 }],
    };
    expect(() =>
      computeSettlement({ members: MEMBERS, sharedExpenses: [broken] }),
    ).toThrow(SettlementImbalanceError);
    const lenient = computeSettlement(
      { members: MEMBERS, sharedExpenses: [broken] },
      { assertBalanced: false },
    );
    expect(lenient.transfers).toEqual([]);
    expect(net(lenient, JUNYONG)).toBe(10_000);
  });

  it('rejects unknown memberships and non-integer amounts', () => {
    expect(() =>
      computeSettlement({
        members: MEMBERS,
        sharedExpenses: [
          shared('m-ghost', 100, [{ membershipId: 'm-ghost', joinOrder: 9 }]),
        ],
      }),
    ).toThrow(RangeError);
    expect(() =>
      computeSettlement({
        members: MEMBERS,
        sharedExpenses: [
          { payerMembershipId: JUNYONG, netKrw: 10.5, shares: [] },
        ],
      }),
    ).toThrow(RangeError);
  });

  it('is deterministic regardless of input order', () => {
    const a = computeSettlement({ members: MEMBERS, sharedExpenses: SAMPLE });
    const b = computeSettlement({
      members: [...MEMBERS].reverse(),
      sharedExpenses: [...SAMPLE].reverse(),
    });
    expect(b).toEqual(a);
  });

  it('keeps Σ net = 0 and settles everyone on random ledgers', () => {
    let seed = 42;
    const random = (n: number) => {
      seed = (seed * 1_103_515_245 + 12_345) % 2 ** 31;
      return seed % n;
    };
    for (let round = 0; round < 200; round += 1) {
      const size = 2 + random(7);
      const members = Array.from({ length: size }, (_, i) => ({
        membershipId: `m${i}`,
        joinOrder: i + 1,
        isLeft: random(5) === 0,
      }));
      const expenses = Array.from({ length: random(12) }, () => {
        const participants = members
          .filter(() => random(3) > 0)
          .map(({ membershipId, joinOrder }) => ({ membershipId, joinOrder }));
        const payer = members[random(size)].membershipId;
        const picked =
          participants.length > 0
            ? participants
            : [{ membershipId: payer, joinOrder: 1 }];
        return {
          payerMembershipId: payer,
          netKrw: random(500_000),
          shares: splitEvenly(random(500_000), picked, payer).shares,
        };
      }).map((e) => ({
        ...e,
        netKrw: e.shares.reduce((s, x) => s + x.amountKrw, 0),
      }));

      const result = computeSettlement({ members, sharedExpenses: expenses });
      expect(result.members.reduce((s, m) => s + m.netKrw, 0)).toBe(0);
      expect(result.transfers.length).toBeLessThanOrEqual(
        Math.max(0, result.memberCount - 1),
      );
      const balance = new Map(
        result.members.map((m) => [m.membershipId, m.netKrw]),
      );
      for (const t of result.transfers) {
        expect(t.amountKrw).toBeGreaterThan(0);
        expect(t.fromMembershipId).not.toBe(t.toMembershipId);
        balance.set(
          t.fromMembershipId,
          balance.get(t.fromMembershipId)! + t.amountKrw,
        );
        balance.set(
          t.toMembershipId,
          balance.get(t.toMembershipId)! - t.amountKrw,
        );
      }
      expect([...balance.values()].every((v) => v === 0)).toBe(true);
    }
  });
});

describe('greedyTransfers', () => {
  it('breaks ties by join order and does not re-sort after each transfer', () => {
    const transfers = greedyTransfers([
      { membershipId: 'c2', joinOrder: 2, netKrw: 500 },
      { membershipId: 'c1', joinOrder: 1, netKrw: 500 },
      { membershipId: 'd3', joinOrder: 3, netKrw: -700 },
      { membershipId: 'd4', joinOrder: 4, netKrw: -300 },
    ]);
    expect(transfers).toEqual([
      { seq: 1, fromMembershipId: 'd3', toMembershipId: 'c1', amountKrw: 500 },
      { seq: 2, fromMembershipId: 'd3', toMembershipId: 'c2', amountKrw: 200 },
      { seq: 3, fromMembershipId: 'd4', toMembershipId: 'c2', amountKrw: 300 },
    ]);
  });

  it('returns nothing when everyone is even', () => {
    expect(
      greedyTransfers([{ membershipId: 'a', joinOrder: 1, netKrw: 0 }]),
    ).toEqual([]);
  });
});

describe('helpers', () => {
  it('divRoundHalfUp rounds .5 up and validates input', () => {
    expect(divRoundHalfUp(826_910, 4)).toBe(206_728);
    expect(divRoundHalfUp(7, 3)).toBe(2);
    expect(divRoundHalfUp(5, 2)).toBe(3);
    expect(divRoundHalfUp(0, 3)).toBe(0);
    expect(() => divRoundHalfUp(1, 0)).toThrow(RangeError);
    expect(() => divRoundHalfUp(-1, 2)).toThrow(RangeError);
  });

  it('settlementDirection', () => {
    expect(settlementDirection(1)).toBe('RECEIVE');
    expect(settlementDirection(-1)).toBe('SEND');
    expect(settlementDirection(0)).toBe('EVEN');
  });
});
