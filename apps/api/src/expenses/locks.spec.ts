import type { Prisma } from '../generated/prisma/client.js';
import { isDeadlock, lockTripsInOrder } from './locks.js';

// 여러 여정을 잠그는 순서(여정 id 오름차순)와 교착 판정. 지갑 여정 바꾸기 ↔ 파일 가져오기 일괄 저장의 교착 방지(W10 재검증 B)

function recordingTx() {
  const calls: string[] = [];
  const tx = {
    $queryRaw: (strings: TemplateStringsArray, ...values: unknown[]) => {
      const sql = strings.join('?');
      calls.push(
        `${sql.includes('FOR SHARE') ? 'trip' : 'advisory'}:${String(values[0]).replace(/^expenses:/, '')}`,
      );
      return Promise.resolve([{ status: 'ONGOING' }]);
    },
  } as unknown as Prisma.TransactionClient;
  return { tx, calls };
}

describe('lockTripsInOrder', () => {
  it('locks each trip once, ascending by id (Trip FOR SHARE → advisory), whatever the call order', async () => {
    const A = '11111111-1111-4111-8111-111111111111';
    const B = '22222222-2222-4222-8222-222222222222';
    // 현재 = B, 대상 = A(내림차순으로 들어와도)
    const { tx, calls } = recordingTx();
    await lockTripsInOrder(tx, [B, A, null, B]);
    expect(calls).toEqual([
      `trip:${A}`,
      `advisory:${A}`,
      `trip:${B}`,
      `advisory:${B}`,
    ]);
    const none = recordingTx();
    await lockTripsInOrder(none.tx, [undefined, null]);
    expect(none.calls).toEqual([]);
  });
});

describe('isDeadlock', () => {
  it('recognises PostgreSQL 40P01 and Prisma P2034 only', () => {
    expect(isDeadlock({ code: 'P2034' })).toBe(true);
    expect(isDeadlock({ code: 'P2010', meta: { code: '40P01' } })).toBe(true);
    expect(isDeadlock(new Error('deadlock detected (SQLSTATE 40P01)'))).toBe(
      true,
    );
    expect(isDeadlock({ code: 'P2002' })).toBe(false);
    expect(isDeadlock(new Error('boom'))).toBe(false);
    expect(isDeadlock(null)).toBe(false);
  });
});
