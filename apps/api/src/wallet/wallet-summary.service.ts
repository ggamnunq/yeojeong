import { Injectable } from '@nestjs/common';
import type { Prisma } from '../generated/prisma/client.js';
import { convertToKrw } from '../fx/convert.js';
import { FxRatesService, type SpotRateTable } from '../fx/fx-rates.service.js';
import { PrismaService } from '../prisma/prisma.service.js';

// 지갑 요약(S7b, Q-51): 이번 달(KST) 결제 합계. 지갑 항목 수(Me.walletEntryCount)는 users가 walletEntryWhere로 센다.

const KST_OFFSET_MS = 9 * 60 * 60 * 1000;

/** 지갑 목록에 보이는 항목: 내 거래, 계좌·카드 양쪽에 잡힌 같은 결제는 한 번만(4-1-3). 목록·합계·Me.walletEntryCount가 같은 기준을 쓴다 */
export const walletEntryWhere = (userId: string) =>
  ({
    userId,
    sameUserDuplicateOfId: null,
  }) satisfies Prisma.TransactionWhereInput;

/** now가 속한 KST 달력 월의 [1일 00:00 KST, 다음 달 1일 00:00 KST) */
export function kstMonthRange(now: Date): { gte: Date; lt: Date } {
  const k = new Date(now.getTime() + KST_OFFSET_MS);
  const year = k.getUTCFullYear();
  const month = k.getUTCMonth();
  return {
    gte: new Date(Date.UTC(year, month, 1) - KST_OFFSET_MS),
    lt: new Date(Date.UTC(year, month + 1, 1) - KST_OFFSET_MS),
  };
}

/** 원화가 정해지지 않은 항목(연결 없음 + 외화 + 카드사·제공자 원화·저장된 추정 원화 모두 없음) */
export interface UnpricedEntry {
  /** 부호 포함 decimal(취소는 음수) */
  amount: string;
  currency: string;
  occurredAt: Date;
}

/** SQL 집계 결과 */
export interface MonthAggregate {
  /** 원화가 있는 항목의 합(취소는 음수로 상계) */
  pricedKrw: number;
  /** 그중 저장된 매매기준율 추정 원화(spotKrwAmount)를 쓴 항목 수 */
  spotEstimatedCount: number;
  unpriced: UnpricedEntry[];
}

export interface MonthTotal {
  monthTotalKrw: number;
  monthTotalEstimated: boolean;
}

/**
 * 집계 + 원화 없는 항목의 추정 → 합계.
 * 원화 없는 항목은 결제 시점 매매기준율(4-5 SPOT, FxRatesService 고시 표)로 환산해 더한다. 고시가 없으면 빼고, 어느 쪽이든 추정으로 표시한다.
 */
export function monthTotalOf(
  aggregate: MonthAggregate,
  rates: Pick<SpotRateTable, 'find'> | null,
): MonthTotal {
  let total = aggregate.pricedKrw;
  for (const entry of aggregate.unpriced) {
    const spot = rates?.find(entry.currency, entry.occurredAt) ?? null;
    if (!spot) continue;
    try {
      total += convertToKrw({
        amount: entry.amount,
        currency: entry.currency,
        policy: 'SPOT_AT_PAYMENT',
        spot,
      }).krwAmount;
    } catch {
      // 환산할 수 없는 값(범위 초과 등)은 고시 없음과 같이 뺀다
    }
  }
  return {
    monthTotalKrw: total,
    monthTotalEstimated:
      aggregate.spotEstimatedCount > 0 || aggregate.unpriced.length > 0,
  };
}

interface AggregateRow {
  priced_krw: bigint;
  spot_estimated: number;
  unpriced: { amount: string; currency: string; occurredAt: string }[];
}

/**
 * 지갑 요약 계산. 합계는 SQL에서 낸다(항목을 메모리로 끌어오지 않는다). 메모리로 읽는 것은 원화가 없는 외화 항목뿐이다.
 * 항목 원화 = GET /api/wallet/entries의 krwAmount와 같은 규칙: 연결된 여정 결제의 원화 → KRW 금액(1원 반올림) → 카드사 청구 → 제공자 → 저장된 매매기준율 추정.
 */
@Injectable()
export class WalletSummaryService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly fx: FxRatesService,
  ) {}

  async monthTotal(userId: string, now: Date): Promise<MonthTotal> {
    const { gte, lt } = kstMonthRange(now);
    // link: 보여 줄 연결(WalletService.visibleLink) — 활성 멤버로 남은 여정 먼저, 그중 공동 먼저. 없으면 아무 연결
    const [row] = await this.prisma.$queryRaw<AggregateRow[]>`
      WITH tx AS (
        SELECT t.id, t.occurred_at, t.original_amount, t.original_currency,
               t.billed_krw_amount, t.provider_krw_amount, t.spot_krw_amount
        FROM transactions t
        WHERE t.user_id = ${userId}::uuid
          AND t.same_user_duplicate_of_id IS NULL
          AND t.occurred_at >= ${gte}
          AND t.occurred_at < ${lt}
      ),
      link AS (
        SELECT DISTINCT ON (e.transaction_id) e.transaction_id, e.krw_amount
        FROM expenses e
        JOIN tx ON tx.id = e.transaction_id
        JOIN memberships m ON m.id = e.payer_membership_id
        JOIN trips tr ON tr.id = e.trip_id
        JOIN groups g ON g.id = tr.group_id
        WHERE e.refund_of_expense_id IS NULL
        ORDER BY e.transaction_id,
                 (m.left_at IS NULL AND tr.deleted_at IS NULL AND g.deleted_at IS NULL) DESC,
                 (e.status = 'SHARED') DESC,
                 e.id
      ),
      priced AS (
        SELECT tx.*,
               CASE
                 WHEN link.krw_amount IS NOT NULL THEN link.krw_amount::bigint
                 WHEN tx.original_currency = 'KRW' THEN ROUND(tx.original_amount)::bigint
                 ELSE COALESCE(tx.billed_krw_amount, tx.provider_krw_amount, tx.spot_krw_amount)::bigint
               END AS krw,
               (link.krw_amount IS NULL
                 AND tx.original_currency <> 'KRW'
                 AND tx.billed_krw_amount IS NULL
                 AND tx.provider_krw_amount IS NULL
                 AND tx.spot_krw_amount IS NOT NULL) AS spot_estimated
        FROM tx LEFT JOIN link ON link.transaction_id = tx.id
      )
      SELECT
        COALESCE(SUM(krw), 0)::bigint AS priced_krw,
        (COUNT(*) FILTER (WHERE spot_estimated))::int AS spot_estimated,
        COALESCE(
          json_agg(json_build_object(
            'amount', original_amount::text,
            'currency', original_currency,
            'occurredAt', occurred_at
          )) FILTER (WHERE krw IS NULL),
          '[]'::json
        ) AS unpriced
      FROM priced`;
    const aggregate: MonthAggregate = {
      pricedKrw: Number(row.priced_krw),
      spotEstimatedCount: row.spot_estimated,
      unpriced: row.unpriced.map((u) => ({
        amount: u.amount,
        currency: u.currency.trim().toUpperCase(),
        occurredAt: new Date(u.occurredAt),
      })),
    };
    const rates =
      aggregate.unpriced.length > 0
        ? await this.fx.loadSpotTable(
            aggregate.unpriced.map((u) => u.currency),
            gte,
            lt,
          )
        : null;
    return monthTotalOf(aggregate, rates);
  }
}
