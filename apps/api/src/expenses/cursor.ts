import type { ExpenseListOrder } from '@yeojeong/shared';
import type { Prisma } from '../generated/prisma/client.js';

// 목록 커서 = (occurredAt, id) 를 base64url JSON으로 감싼 불투명 문자열(6-1)

export interface ExpenseCursor {
  occurredAt: Date;
  id: string;
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function encodeCursor(cursor: ExpenseCursor): string {
  return Buffer.from(
    JSON.stringify({ o: cursor.occurredAt.toISOString(), i: cursor.id }),
  ).toString('base64url');
}

/** 형식이 틀리면 null */
export function decodeCursor(value: string): ExpenseCursor | null {
  try {
    const parsed: unknown = JSON.parse(
      Buffer.from(value, 'base64url').toString('utf8'),
    );
    if (typeof parsed !== 'object' || parsed === null) return null;
    const { o, i } = parsed as Record<string, unknown>;
    if (typeof o !== 'string' || typeof i !== 'string' || !UUID.test(i)) {
      return null;
    }
    const occurredAt = new Date(o);
    if (Number.isNaN(occurredAt.getTime())) return null;
    return { occurredAt, id: i };
  } catch {
    return null;
  }
}

/** 커서 다음 페이지 조건. 정렬은 (occurredAt, id) 같은 방향 */
export function afterCursor(
  cursor: ExpenseCursor,
  order: ExpenseListOrder,
): Prisma.ExpenseWhereInput {
  const op = order === 'asc' ? 'gt' : 'lt';
  return {
    OR: [
      { occurredAt: { [op]: cursor.occurredAt } },
      { occurredAt: cursor.occurredAt, id: { [op]: cursor.id } },
    ],
  };
}
