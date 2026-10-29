import { Injectable } from '@nestjs/common';
import {
  WALLET_ENTRY_FIELD_VALUES,
  WALLET_ENTRY_LIST_LIMIT,
  type CreateWalletEntryRequest,
  type ExpenseDetailResponse,
  type FieldError,
  type FileImportProvider,
  type ImportWalletEntriesResponse,
  type ImportWalletEntryItem,
  type TripStatus,
  type TxSource,
  type UpdateWalletEntryRequest,
  type WalletEntry,
  type WalletEntryField,
  type WalletEntryListResponse,
  type WalletEntryMutationResponse,
  type WalletLinkedTrip,
  type WalletTripCandidatesResponse,
} from '@yeojeong/shared';
import { AuditService } from '../audit/index.js';
import { ItemTokenSigner } from '../card-import/item-token.js';
import {
  AppException,
  NotFoundError,
  ValidationFailedError,
} from '../common/errors/index.js';
import { decodeCursor, encodeCursor } from '../expenses/cursor.js';
import { effectiveStatus } from '../expenses/expense-rules.js';
import { formatOriginalAmount } from '../expenses/expense-view.js';
import { isUuid } from '../expenses/expense-query.service.js';
import { dateOnly, kstDate, toKstIso } from '../expenses/kst.js';
import { lockTransactions, lockTripExpenses } from '../expenses/locks.js';
import {
  checkInputs,
  ManualExpenseService,
  type ManualEditRecord,
  type ManualMember,
  type ManualTrip,
  type WalletEntryOrigin,
} from '../expenses/manual-expense.service.js';
import {
  defaultWalletCurrency,
  manualAmountError,
  manualKrwError,
  memoError,
  memoOf,
  merchantNameOf,
  occurredAtError,
  rankTripCandidates,
  suggestedTripOf,
  type TripCandidateInput,
} from '../expenses/manual-input.js';
import { krwAmountOf } from '../fx/convert.js';
import { Prisma } from '../generated/prisma/client.js';
import { PrismaService } from '../prisma/prisma.service.js';
import {
  walletEntryWhere,
  WalletSummaryService,
} from './wallet-summary.service.js';

type Tx = Prisma.TransactionClient;

/** 연결 후보(내가 활성 멤버인 예정·진행 중 여정) */
interface TripOption extends TripCandidateInput {
  membershipId: string;
  groupName: string;
  placeLabel: string;
  startDate: string;
  endDate: string;
}

const ENTRY_SELECT = {
  id: true,
  source: true,
  kind: true,
  occurredAt: true,
  merchantNameRaw: true,
  originalAmount: true,
  originalCurrency: true,
  providerKrwAmount: true,
  billedKrwAmount: true,
  spotKrwAmount: true,
  version: true,
  paymentMethod: { select: { shortLabel: true, last4: true } },
  expenses: {
    where: { refundOfExpenseId: null },
    select: {
      id: true,
      status: true,
      krwAmount: true,
      version: true,
      payer: { select: { leftAt: true } },
      trip: {
        select: {
          id: true,
          status: true,
          placeLabel: true,
          deletedAt: true,
          group: { select: { name: true, deletedAt: true } },
        },
      },
    },
  },
} satisfies Prisma.TransactionSelect;

type EntryRecord = Prisma.TransactionGetPayload<{
  select: typeof ENTRY_SELECT;
}>;
type LinkRecord = EntryRecord['expenses'][number];

/** 장부를 더 바꿀 수 없는 연결(종료·삭제된 여정, 내가 나간 여정) */
function ledgerLocked(link: LinkRecord): boolean {
  return (
    link.trip.status === 'ENDED' ||
    link.trip.deletedAt !== null ||
    link.trip.group.deletedAt !== null ||
    link.payer.leftAt !== null
  );
}

/** 보여 줄 연결: 내가 활성 멤버로 남아 있는 여정. 여럿이면(가져온 거래) 공동 먼저 */
function visibleLink(record: EntryRecord): LinkRecord | null {
  const links = record.expenses.filter(
    (e) =>
      e.payer.leftAt === null &&
      e.trip.deletedAt === null &&
      e.trip.group.deletedAt === null,
  );
  return links.find((e) => e.status === 'SHARED') ?? links[0] ?? null;
}

/**
 * 사용자가 직접 만든 지갑 항목: 직접 입력(MANUAL)과 카드 승인내역에서 고른 것(CARD_IMPORT, S8), 거래 내역 파일에서 고른 것(FILE_IMPORT, W10).
 * 둘 다 결제수단·제공자 동기화가 없어 수정·삭제·여정 바꾸기를 같은 규칙으로 한다(여정 결제는 origin MANUAL, 작성자 = 나)
 */
export function isUserEntrySource(source: TxSource): boolean {
  return (
    source === 'MANUAL' || source === 'CARD_IMPORT' || source === 'FILE_IMPORT'
  );
}

const fieldError = (path: string, code: string, message: string) =>
  new ValidationFailedError([{ path, code, message }]);

const tripNotAvailable = () =>
  fieldError('tripId', 'tripNotAvailable', '추가할 수 없는 여정이에요');

const isUniqueViolation = (error: unknown) =>
  error instanceof Prisma.PrismaClientKnownRequestError &&
  error.code === 'P2002';

/**
 * 내 지갑(S7, 명세 v0.6.0): 직접 입력한 결제(Transaction.source MANUAL)와 계좌·카드에서 가져온 거래를 함께 보여 준다.
 * 직접 입력은 날짜가 기간 안인 예정·진행 중 여정에 자동으로 미확정(PENDING, 결제자 = 나)으로 연결된다(가져온 결제와 같은 분류 흐름).
 * 지갑 항목은 본인만 본다(userId 조건). 여정 쪽 잠금 순서는 결제 변경과 같고, 거래 행은 마지막에 잠근다.
 */
@Injectable()
export class WalletService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly manual: ManualExpenseService,
    private readonly summary: WalletSummaryService,
    private readonly audit: AuditService,
    private readonly itemTokens: ItemTokenSigner,
  ) {}

  // ─── 연결 후보 ───

  async tripCandidates(
    userId: string,
    at: Date,
  ): Promise<WalletTripCandidatesResponse> {
    const ranked = rankTripCandidates(await this.tripOptions(userId), at);
    return {
      items: ranked.map(({ trip, inPeriod }) => ({
        tripId: trip.tripId,
        groupName: trip.groupName,
        placeLabel: trip.placeLabel,
        status: trip.status as 'UPCOMING' | 'ONGOING',
        startDate: trip.startDate,
        endDate: trip.endDate,
        currency: trip.currency,
        inPeriod,
      })),
      suggestedTripId: suggestedTripOf(ranked)?.tripId ?? null,
      defaultCurrency: defaultWalletCurrency(ranked),
    };
  }

  private async tripOptions(userId: string): Promise<TripOption[]> {
    const rows = await this.prisma.membership.findMany({
      where: {
        userId,
        leftAt: null,
        group: {
          deletedAt: null,
          trip: {
            status: { in: ['UPCOMING', 'ONGOING'] },
            deletedAt: null,
          },
        },
      },
      select: {
        id: true,
        group: {
          select: {
            name: true,
            trip: {
              select: {
                id: true,
                status: true,
                placeLabel: true,
                currency: true,
                startDate: true,
                endDate: true,
                startAt: true,
                autoEndAt: true,
              },
            },
          },
        },
      },
    });
    return rows.flatMap((r) => {
      const trip = r.group.trip;
      if (!trip) return [];
      return [
        {
          tripId: trip.id,
          membershipId: r.id,
          groupName: r.group.name,
          placeLabel: trip.placeLabel,
          status: trip.status as TripStatus,
          currency: trip.currency,
          startDate: dateOnly(trip.startDate),
          endDate: dateOnly(trip.endDate),
          startAt: trip.startAt,
          autoEndAt: trip.autoEndAt,
        },
      ];
    });
  }

  // ─── 목록 ───

  /** 이번 달 합계(monthTotalKrw·monthTotalEstimated)는 커서와 무관하게 전체 기준으로, 페이지마다 다시 계산한다(S7b) */
  async list(
    userId: string,
    options: { cursor?: string; limit?: number },
    now: Date = new Date(),
  ): Promise<WalletEntryListResponse> {
    const limit = Math.min(
      Math.max(options.limit ?? WALLET_ENTRY_LIST_LIMIT.DEFAULT, 1),
      WALLET_ENTRY_LIST_LIMIT.MAX,
    );
    const and: Prisma.TransactionWhereInput[] = [
      // 계좌·카드 양쪽에 잡힌 같은 결제는 한 번만(4-1-3)
      walletEntryWhere(userId),
    ];
    if (options.cursor !== undefined) {
      const cursor = decodeCursor(options.cursor);
      if (!cursor) {
        throw fieldError('cursor', 'invalid', '목록 위치가 올바르지 않아요');
      }
      and.push({
        OR: [
          { occurredAt: { lt: cursor.occurredAt } },
          { occurredAt: cursor.occurredAt, id: { lt: cursor.id } },
        ],
      });
    }
    const [records, month] = await Promise.all([
      this.prisma.transaction.findMany({
        where: { AND: and },
        orderBy: [{ occurredAt: 'desc' }, { id: 'desc' }],
        take: limit + 1,
        select: ENTRY_SELECT,
      }),
      this.summary.monthTotal(userId, now),
    ]);
    const page = records.slice(0, limit);
    const last = page.at(-1);
    return {
      items: page.map((r) => this.toEntry(r)),
      nextCursor:
        records.length > limit && last
          ? encodeCursor({ occurredAt: last.occurredAt, id: last.id })
          : null,
      ...month,
    };
  }

  private toEntry(record: EntryRecord): WalletEntry {
    const manual = isUserEntrySource(record.source);
    const link = visibleLink(record);
    const anyLink = record.expenses[0] ?? null;
    const amount = formatOriginalAmount(
      record.originalAmount,
      record.originalCurrency,
    );
    const linkedTrip: WalletLinkedTrip | null = link
      ? {
          tripId: link.trip.id,
          groupName: link.trip.group.name,
          placeLabel: link.trip.placeLabel,
          tripStatus: link.trip.status as TripStatus,
          expenseId: link.id,
          expenseStatus: effectiveStatus(
            link.status,
            link.trip.status as TripStatus,
          ),
          expenseVersion: link.version,
        }
      : null;
    let editableFields: WalletEntryField[] = [];
    if (manual) {
      editableFields =
        anyLink && record.expenses.every(ledgerLocked)
          ? ['memo']
          : [...WALLET_ENTRY_FIELD_VALUES];
    }
    // 연결 여정 바꾸기(Q-46): 연결 없음 또는 잠기지 않은 미확정
    const canChangeTrip =
      manual &&
      (anyLink === null ||
        (anyLink.status === 'PENDING' && !ledgerLocked(anyLink)));
    return {
      id: record.id,
      source: record.source,
      kind: record.kind,
      occurredAt: toKstIso(record.occurredAt),
      localDate: kstDate(record.occurredAt),
      merchantName: record.merchantNameRaw,
      memo: manual ? memoOf(record.merchantNameRaw) : null,
      amount,
      currency: record.originalCurrency,
      krwAmount: this.krwOf(record, link ?? anyLink),
      paymentMethodLabel: record.paymentMethod
        ? `${record.paymentMethod.shortLabel} ${record.paymentMethod.last4}`
        : null,
      linkedTrip,
      editableFields,
      canChangeTrip,
      canDelete: manual,
      version: record.version,
    };
  }

  /** 연결된 여정 결제의 원화 → KRW 금액 → 카드사·제공자 원화 → 매매기준율 추정 */
  private krwOf(record: EntryRecord, link: LinkRecord | null): number | null {
    if (link) return link.krwAmount;
    if (record.originalCurrency === 'KRW') {
      return krwAmountOf(record.originalAmount.toFixed(4));
    }
    return (
      record.billedKrwAmount ??
      record.providerKrwAmount ??
      record.spotKrwAmount ??
      null
    );
  }

  private async loadEntry(userId: string, entryId: string) {
    const record = await this.prisma.transaction.findFirst({
      where: { id: entryId, userId },
      select: ENTRY_SELECT,
    });
    if (!record) throw new NotFoundError();
    return record;
  }

  private async respond(
    userId: string,
    entryId: string,
  ): Promise<WalletEntryMutationResponse> {
    const record = await this.loadEntry(userId, entryId);
    const entry = this.toEntry(record);
    let linkedExpense: ExpenseDetailResponse | null = null;
    if (entry.linkedTrip) {
      const membership = await this.prisma.membership.findFirst({
        where: {
          userId,
          leftAt: null,
          group: { trip: { id: entry.linkedTrip.tripId } },
        },
        select: { id: true },
      });
      if (membership) {
        linkedExpense = await this.manual.detailFor(
          entry.linkedTrip.tripId,
          membership,
          entry.linkedTrip.expenseId,
        );
      }
    }
    return { entry, linkedExpense };
  }

  // ─── 추가 ───

  async create(
    userId: string,
    body: CreateWalletEntryRequest,
    now: Date = new Date(),
  ): Promise<WalletEntryMutationResponse> {
    if (body.clientRequestId) {
      const existing = await this.findByClientRequest(
        userId,
        body.clientRequestId,
      );
      if (existing) return this.respond(userId, existing.id);
    }
    const occurredAt = body.occurredAt ? new Date(body.occurredAt) : now;
    checkInputs(occurredAt, body.memo, now);
    let entryId: string;
    try {
      entryId = await this.insertEntry(
        userId,
        {
          amount: body.amount,
          currency: body.currency,
          occurredAt,
          merchantName: merchantNameOf(body.memo),
          tripId: body.tripId,
          clientRequestId: body.clientRequestId ?? null,
        },
        { source: 'MANUAL' },
        now,
      );
    } catch (error) {
      if (body.clientRequestId && isUniqueViolation(error)) {
        const existing = await this.findByClientRequest(
          userId,
          body.clientRequestId,
        );
        if (existing) return this.respond(userId, existing.id);
      }
      throw error;
    }
    return this.respond(userId, entryId);
  }

  /**
   * 지갑 항목 한 건을 만들고 여정에 연결한다(직접 입력·카드 승인내역 불러오기 공통).
   * tripId 생략 = 자동 연결(기간 안 예정·진행 중 여정), uuid = 그 여정, null = 지갑에만. 입력 검사(시각·내용)는 호출자가 먼저 한다
   */
  private async insertEntry(
    userId: string,
    input: {
      amount: string;
      currency?: string;
      occurredAt: Date;
      merchantName: string;
      tripId?: string | null;
      clientRequestId: string | null;
    },
    origin: WalletEntryOrigin,
    now: Date,
  ): Promise<string> {
    const { occurredAt, merchantName } = input;
    const ranked = rankTripCandidates(
      await this.tripOptions(userId),
      occurredAt,
    );
    let target: TripOption | null;
    if (input.tripId === null) {
      target = null;
    } else if (input.tripId !== undefined) {
      target = ranked.find((r) => r.trip.tripId === input.tripId)?.trip ?? null;
      if (!target) throw tripNotAvailable();
    } else {
      target = suggestedTripOf(ranked);
    }
    const currency = (
      input.currency ?? defaultWalletCurrency(ranked)
    ).toUpperCase();
    const amount = input.amount.trim();
    const amountError = manualAmountError(amount, currency);
    if (amountError) throw new ValidationFailedError([amountError]);
    const providerKrwAmount =
      origin.source === 'CARD_IMPORT' ? origin.providerKrwAmount : null;

    const chosen = target;
    return this.prisma.$transaction(async (tx) => {
      const values = { amount, currency, occurredAt, merchantName };
      if (!chosen) {
        await this.checkWalletOnlyKrw(tx, amount, currency, providerKrwAmount);
        return this.manual.insertWalletTransaction(tx, {
          userId,
          amounts: values,
          merchantName,
          clientRequestId: input.clientRequestId,
          origin,
        });
      }
      // 여정 잠금이 먼저(결제 변경과 같은 순서), 거래·결제는 그 뒤에 만든다
      const link = await this.lockTargetTrip(tx, userId, chosen);
      const amounts = await this.manual.convert(tx, link.trip, {
        ...values,
        providerKrwAmount,
      });
      const transactionId = await this.manual.insertWalletTransaction(tx, {
        userId,
        amounts,
        merchantName,
        clientRequestId: input.clientRequestId,
        origin,
      });
      await this.insertPending(
        tx,
        link,
        amounts,
        merchantName,
        transactionId,
        now,
      );
      return transactionId;
    });
  }

  // ─── 카드 승인내역에서 고른 것 저장(S8) ───

  /**
   * 카드 승인내역 불러오기(S8)에서 사용자가 고른 승인 건을 지갑에 저장한다. 직접 입력과 같은 규칙(시각 범위·내용 40자·금액·원화 1억 상한)과
   * 같은 여정 자동 연결을 쓴다. importKey가 이미 저장돼 있으면 새로 만들지 않고 그 항목을 돌려준다(created=false) — 다시 보내도 안전하다.
   * 서버는 승인번호 원문을 받지 않으므로 importKey를 다시 계산해 검증할 수 없다(형식만 본다). 모두 검사한 뒤 한 건씩 저장한다
   */
  async importEntries(
    userId: string,
    items: readonly ImportWalletEntryItem[],
    now: Date = new Date(),
  ): Promise<ImportWalletEntriesResponse> {
    // 서버가 이 사용자에게 돌려준 값 그대로인지(itemToken 서명·30분). 하나라도 아니면 아무것도 저장하지 않는다
    const invalidIndexes = items.flatMap((item, index) =>
      this.itemTokens.verify(
        userId,
        {
          importKey: item.importKey,
          occurredAt: item.occurredAt,
          amount: item.amount,
          currency: item.currency,
          merchantName: item.merchantName,
          krwAmount: item.krwAmount,
        },
        item.itemToken,
        now.getTime(),
      )
        ? []
        : [index],
    );
    if (invalidIndexes.length > 0) {
      throw AppException.of('CARD_IMPORT_RESULT_EXPIRED', {
        details: { invalidIndexes },
      });
    }
    const errors = items.flatMap((item, index) => {
      const prefix = `items.${index}`;
      const occurredAt = new Date(item.occurredAt);
      const found = [
        occurredAtError(occurredAt, now, `${prefix}.occurredAt`),
        memoError(item.merchantName, `${prefix}.merchantName`),
        manualAmountError(item.amount, item.currency, `${prefix}.amount`),
      ];
      if (
        items.findIndex((other) => other.importKey === item.importKey) < index
      ) {
        found.push({
          path: `${prefix}.importKey`,
          code: 'duplicate',
          message: '같은 결제가 두 번 있어요',
        });
      }
      return found.filter((e) => e !== null);
    });
    if (errors.length > 0) throw new ValidationFailedError(errors);

    const results: ImportWalletEntriesResponse['items'] = [];
    let linked = 0;
    for (const item of items) {
      let id = (await this.findImported(userId, item.importKey))?.id;
      let created = false;
      if (!id) {
        try {
          id = await this.insertEntry(
            userId,
            {
              amount: item.amount,
              currency: item.currency,
              occurredAt: new Date(item.occurredAt),
              merchantName: merchantNameOf(item.merchantName),
              tripId: item.tripId,
              clientRequestId: null,
            },
            {
              source: 'CARD_IMPORT',
              externalRef: item.importKey,
              providerKrwAmount: item.krwAmount ?? null,
            },
            now,
          );
          created = true;
        } catch (error) {
          // 동시에 같은 건을 저장했다: 먼저 들어간 항목을 돌려준다
          if (!isUniqueViolation(error)) throw error;
          id = (await this.findImported(userId, item.importKey))?.id;
          if (!id) throw error;
        }
      }
      const entry = this.toEntry(await this.loadEntry(userId, id));
      if (created && entry.linkedTrip) linked += 1;
      results.push({ importKey: item.importKey, created, entry });
    }
    // 접근 기록: 건수만(금액·가맹점 없음)
    await this.audit.record({
      userId,
      action: 'IMPORT_CARD_APPROVALS',
      resourceType: 'USER',
      resourceId: userId,
      details: {
        requested: items.length,
        created: results.filter((r) => r.created).length,
        linked,
      },
    });
    const createdCount = results.filter((r) => r.created).length;
    return {
      items: results,
      created: createdCount,
      skipped: results.length - createdCount,
      linked,
    };
  }

  // ─── 거래 내역 파일에서 고른 것 저장(W10) ───

  /**
   * 파일 가져오기(W10) 한 요청을 **한 트랜잭션**으로 저장한다 — 하나라도 실패하면(원화 1억 상한·환율 없음·일일 상한 등) 아무것도 남지 않는다.
   * - 사용자 단위 advisory lock으로 같은 사용자의 가져오기를 한 줄로 세운다(이미 있는 거래 확인·일일 상한 판정이 경합 없이 맞다).
   * - (사용자, FILE_IMPORT, importKey)가 이미 있으면 그 항목(created=false). 같은 요청 안의 같은 키는 호출자가 막는다.
   * - 자동 연결 대상 여정은 트랜잭션 전에 한 번 정하고, 여정 id 순서로 여정마다 **한 번만** 잠근 뒤 그 여정 건을 몰아서 넣는다
   *   (잠금 순서가 일정해 교착이 없고, 같은 여정을 항목마다 다시 잠그지 않는다).
   * - dailyLimit: KST 오늘 새로 만든 FILE_IMPORT 수 + 이번에 새로 만들 수가 상한을 넘으면 onDailyLimit()가 던지는 오류로 끝낸다.
   * 입력 검사(시각·내용·금액·통화)는 호출자가 먼저 한다. 반환은 요청 순서
   */
  async saveFileImportBatch(
    userId: string,
    provider: FileImportProvider,
    items: readonly {
      importKey: string;
      amount: string;
      currency: string;
      occurredAt: Date;
      merchantName: string;
    }[],
    limit: { dailyLimit: number; dayStart: Date; onDailyLimit: () => Error },
    now: Date,
  ): Promise<{ entryId: string; created: boolean; linked: boolean }[]> {
    const options = await this.tripOptions(userId);
    const targets = items.map((item) =>
      suggestedTripOf(rankTripCandidates(options, item.occurredAt)),
    );
    return this.prisma.$transaction(
      async (tx) => {
        await tx.$queryRaw`
          SELECT 1 AS ok FROM pg_advisory_xact_lock(hashtext(${`file-import:${userId}`}))`;
        const existing = await tx.transaction.findMany({
          where: {
            userId,
            source: 'FILE_IMPORT',
            externalRef: { in: items.map((i) => i.importKey) },
          },
          select: { id: true, externalRef: true },
        });
        const existingId = new Map(existing.map((e) => [e.externalRef, e.id]));
        const fresh = items
          .map((item, index) => ({ item, index, target: targets[index] }))
          .filter(({ item }) => !existingId.has(item.importKey));

        if (fresh.length > 0) {
          const today = await tx.transaction.count({
            where: {
              userId,
              source: 'FILE_IMPORT',
              createdAt: { gte: limit.dayStart },
            },
          });
          if (today + fresh.length > limit.dailyLimit)
            throw limit.onDailyLimit();
        }

        // 여정 id 순(지갑에만 넣는 건은 맨 뒤) → 시각 순
        fresh.sort(
          (a, b) =>
            (a.target?.tripId ?? '\uffff').localeCompare(
              b.target?.tripId ?? '\uffff',
            ) || a.item.occurredAt.getTime() - b.item.occurredAt.getTime(),
        );
        const locked = new Map<
          string,
          Awaited<ReturnType<WalletService['lockTargetTrip']>>
        >();
        const results: {
          entryId: string;
          created: boolean;
          linked: boolean;
        }[] = items.map((item) => ({
          entryId: existingId.get(item.importKey) ?? '',
          created: false,
          linked: false,
        }));
        for (const { item, index, target } of fresh) {
          const origin: WalletEntryOrigin = {
            source: 'FILE_IMPORT',
            externalRef: item.importKey,
            provider,
          };
          const merchantName = merchantNameOf(item.merchantName);
          const values = {
            amount: item.amount.trim(),
            currency: item.currency.toUpperCase(),
            occurredAt: item.occurredAt,
            merchantName,
          };
          try {
            let entryId: string;
            if (!target) {
              await this.checkWalletOnlyKrw(tx, values.amount, values.currency);
              entryId = await this.manual.insertWalletTransaction(tx, {
                userId,
                amounts: values,
                merchantName,
                clientRequestId: null,
                origin,
              });
            } else {
              let link = locked.get(target.tripId);
              if (!link) {
                link = await this.lockTargetTrip(tx, userId, target);
                locked.set(target.tripId, link);
              }
              const amounts = await this.manual.convert(tx, link.trip, {
                ...values,
                providerKrwAmount: null,
              });
              entryId = await this.manual.insertWalletTransaction(tx, {
                userId,
                amounts,
                merchantName,
                clientRequestId: null,
                origin,
              });
              await this.insertPending(
                tx,
                link,
                amounts,
                merchantName,
                entryId,
                now,
              );
            }
            results[index] = {
              entryId,
              created: true,
              linked: target !== null,
            };
          } catch (error) {
            // 항목별 검사 오류(원화 상한 등)는 그 항목 경로로 알린다
            if (error instanceof ValidationFailedError) {
              const fields = (error.details?.fields ?? []) as FieldError[];
              throw new ValidationFailedError(
                fields.map((f) => ({ ...f, path: `items.${index}.${f.path}` })),
              );
            }
            throw error;
          }
        }
        return results;
      },
      // 200건까지 한 번에 넣는다(여정 잠금은 여정마다 한 번)
      { maxWait: 10_000, timeout: 60_000 },
    );
  }

  private findImported(userId: string, importKey: string) {
    return this.prisma.transaction.findFirst({
      where: { userId, source: 'CARD_IMPORT', externalRef: importKey },
      select: { id: true },
    });
  }

  private findByClientRequest(userId: string, clientRequestId: string) {
    return this.prisma.transaction.findUnique({
      where: { userId_clientRequestId: { userId, clientRequestId } },
      select: { id: true },
    });
  }

  /** 연결할 여정(예정·진행 중, 내가 활성 멤버)을 잠그고 다시 확인한다 */
  private async lockTargetTrip(tx: Tx, userId: string, option: TripOption) {
    const trip = await this.manual.lockTrip(tx, option.tripId);
    if (!trip || trip.status === 'ENDED') throw tripNotAvailable();
    await lockTripExpenses(tx, trip.id);
    const members = await this.manual.lockMembers(tx, trip.groupId);
    const mine = members.find(
      (m) =>
        m.id === option.membershipId &&
        m.userId === userId &&
        m.leftAt === null,
    );
    if (!mine) throw tripNotAvailable();
    return { trip, members, mine };
  }

  /** 지갑 항목을 여정에 미확정으로 넣는다(가져온 결제와 같다: 결제자 = 작성자 = 나, 분류는 PUT classification) */
  private insertPending(
    tx: Tx,
    link: Awaited<ReturnType<WalletService['lockTargetTrip']>>,
    amounts: Awaited<ReturnType<ManualExpenseService['convert']>>,
    merchantName: string,
    transactionId: string,
    now: Date,
  ) {
    return this.manual.insertExpense(tx, {
      trip: link.trip,
      members: link.members,
      actorMembershipId: link.mine.id,
      payerMembershipId: link.mine.id,
      status: 'PENDING',
      participantMembershipIds: [],
      amounts,
      merchantName,
      transactionId,
      clientRequestId: null,
      now,
    });
  }

  /** 여정에 연결하지 않는 항목도 원화 1억 상한을 지킨다(KRW는 금액, 외화는 카드사 원화 → 최신 매매기준율 추정이 있을 때) */
  private async checkWalletOnlyKrw(
    tx: Tx,
    amount: string,
    currency: string,
    providerKrwAmount: number | null = null,
  ) {
    const krw =
      currency === 'KRW'
        ? krwAmountOf(amount)
        : (providerKrwAmount ??
          (await this.manual.spotEstimate(tx, amount, currency)).spotKrwAmount);
    const error = krw === null ? null : manualKrwError(krw);
    if (error) throw new ValidationFailedError([error]);
  }

  // ─── 수정·삭제 ───

  /** 잠금: (연결이 있으면) Trip FOR SHARE → advisory → 멤버 → Expense FOR UPDATE → 거래 FOR UPDATE */
  private async lockEntry(tx: Tx, userId: string, entryId: string) {
    const link = await tx.expense.findFirst({
      where: { transactionId: entryId, refundOfExpenseId: null },
      select: { id: true, tripId: true },
    });
    let trip: ManualTrip | null = null;
    let members: ManualMember[] = [];
    let expense: ManualEditRecord | null = null;
    if (link) {
      // 삭제된 여정이면 trip = null(장부는 잠긴 것으로 본다)
      trip = await this.manual.lockTrip(tx, link.tripId);
      if (trip) {
        await lockTripExpenses(tx, trip.id);
        members = await this.manual.lockMembers(tx, trip.groupId);
      }
      expense = await this.manual.lockManualRecord(tx, link.tripId, link.id);
      if (expense && expense.transactionId !== entryId) expense = null;
    }
    await lockTransactions(tx, [entryId]);
    const current = await tx.transaction.findFirst({
      where: { id: entryId, userId },
      select: {
        id: true,
        source: true,
        version: true,
        occurredAt: true,
        merchantNameRaw: true,
        originalAmount: true,
        originalCurrency: true,
      },
    });
    if (!current) throw new NotFoundError();
    if (!isUserEntrySource(current.source)) {
      throw AppException.of('NOT_MANUAL_ENTRY');
    }
    const locked =
      expense !== null &&
      (trip === null ||
        trip.status === 'ENDED' ||
        expense.payer.leftAt !== null ||
        !members.some(
          (m) =>
            m.id === expense.payerMembershipId &&
            m.userId === userId &&
            m.leftAt === null,
        ));
    return { trip, members, expense, current, locked };
  }

  async update(
    userId: string,
    entryId: string,
    body: UpdateWalletEntryRequest,
    now: Date = new Date(),
  ): Promise<WalletEntryMutationResponse> {
    if (!isUuid(entryId)) throw new NotFoundError();
    const occurredAt =
      body.occurredAt !== undefined ? new Date(body.occurredAt) : undefined;
    checkInputs(occurredAt, body.memo, now);
    // 연결 여정 바꾸기(Q-46) 후보는 잠금 전에 읽고, 잠근 뒤 다시 확인한다
    const options =
      typeof body.tripId === 'string' ? await this.tripOptions(userId) : [];

    const conflict = await this.prisma.$transaction(async (tx) => {
      const { trip, members, expense, current, locked } = await this.lockEntry(
        tx,
        userId,
        entryId,
      );
      if (body.version !== current.version) return true;

      const amount = body.amount?.trim() ?? current.originalAmount.toFixed();
      const currency = (
        body.currency ?? current.originalCurrency
      ).toUpperCase();
      const at = occurredAt ?? current.occurredAt;
      const amountsChanged =
        !current.originalAmount.equals(amount) ||
        currency !== current.originalCurrency ||
        at.getTime() !== current.occurredAt.getTime();
      if (amountsChanged && locked) {
        throw AppException.of('EXPENSE_LOCKED', {
          message: '종료된 여정에 연결된 결제는 내용만 바꿀 수 있어요',
          details: { lockedFields: ['amount', 'currency', 'occurredAt'] },
        });
      }
      if (amountsChanged) {
        const amountError = manualAmountError(amount, currency);
        if (amountError) throw new ValidationFailedError([amountError]);
      }
      const merchantName =
        body.memo !== undefined
          ? merchantNameOf(body.memo)
          : current.merchantNameRaw;

      const currentTripId = expense?.tripId ?? null;
      const relink = body.tripId !== undefined && body.tripId !== currentTripId;
      let target: TripOption | null = null;
      if (relink) {
        // 연결된 결제가 없거나 미확정일 때만(Q-46). 확정(개인·공동) 뒤나 잠긴 결제는 409
        if (expense && (expense.status !== 'PENDING' || locked)) {
          throw AppException.of('EXPENSE_LOCKED', {
            message: '확정된 결제는 여정을 바꿀 수 없어요',
            details: { lockedFields: ['tripId'] },
          });
        }
        if (typeof body.tripId === 'string') {
          target = options.find((o) => o.tripId === body.tripId) ?? null;
          if (!target) throw tripNotAvailable();
        }
      }
      if (
        !relink &&
        !amountsChanged &&
        merchantName === current.merchantNameRaw
      ) {
        return false;
      }

      const values = { amount, currency, occurredAt: at };
      if (relink) {
        if (expense) await this.manual.deleteExpense(tx, expense, userId);
        if (target) {
          const link = await this.lockTargetTrip(tx, userId, target);
          const amounts = await this.manual.convert(tx, link.trip, values);
          await this.insertPending(
            tx,
            link,
            amounts,
            merchantName,
            entryId,
            now,
          );
        } else if (amountsChanged) {
          await this.checkWalletOnlyKrw(tx, amount, currency);
        }
      } else if (expense && trip && !locked) {
        // 여정 장부에 반영(공동이면 부담 재계산·"변경됨"·version 증가·중복 의심 재판정)
        const amounts = amountsChanged
          ? await this.manual.convert(tx, trip, values)
          : null;
        await this.manual.applyLedgerEdit(tx, {
          expense,
          members,
          actorMembershipId: expense.payerMembershipId,
          payerMembershipId: expense.payerMembershipId,
          nextStatus: expense.status,
          participantMembershipIds:
            expense.status === 'SHARED'
              ? expense.shares.map((s) => s.membershipId)
              : [],
          amounts,
          merchantName,
          now,
        });
      } else if (amountsChanged) {
        await this.checkWalletOnlyKrw(tx, amount, currency);
      }
      // 종료된 여정에 연결된 항목의 내용 수정은 지갑에만 반영한다(Q-44, 종료 후 장부는 그대로 — I-6)
      await this.manual.updateWalletTransaction(tx, entryId, {
        amounts: amountsChanged ? values : null,
        merchantName,
      });
      return false;
    });
    const response = await this.respond(userId, entryId);
    if (conflict) {
      throw AppException.of('VERSION_CONFLICT', {
        details: { current: response },
      });
    }
    return response;
  }

  /**
   * 지갑 항목 삭제(명세 v0.6.0):
   * - 연결된 미확정·개인 결제는 같이 지운다.
   * - 연결된 공동 결제: 예정·진행 중 여정이면 includeShared=true일 때만 같이 지운다(아니면 409 SHARED_DELETE_CONFIRM_REQUIRED).
   *   종료된(또는 내가 나간·삭제된) 여정의 공동 결제는 지우지 않고 남긴다 — 지갑 항목만 지우고 Expense.transactionId가 NULL이 된다(FK SET NULL).
   */
  async remove(
    userId: string,
    entryId: string,
    includeShared: boolean,
  ): Promise<void> {
    if (!isUuid(entryId)) throw new NotFoundError();
    await this.prisma.$transaction(async (tx) => {
      const { expense, locked } = await this.lockEntry(tx, userId, entryId);
      if (expense) {
        if (expense.status !== 'SHARED') {
          await this.manual.deleteExpense(tx, expense, userId);
        } else if (!locked) {
          if (!includeShared) {
            throw AppException.of('SHARED_DELETE_CONFIRM_REQUIRED', {
              details: { tripId: expense.tripId, expenseId: expense.id },
            });
          }
          await this.manual.deleteExpense(tx, expense, userId);
        }
      }
      await tx.transaction.delete({ where: { id: entryId } });
    });
  }
}
