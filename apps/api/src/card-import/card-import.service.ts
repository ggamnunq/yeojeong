import { Injectable, Logger } from '@nestjs/common';
import {
  CARD_IMPORT_DEFAULT_RANGE_DAYS,
  CARD_IMPORT_MAX_LOOKBACK_DAYS,
  CARD_IMPORT_MAX_RANGE_DAYS,
  CARD_IMPORT_REQUIRED_CONSENTS,
  CARD_IMPORT_SIMILAR_WINDOW_MINUTES,
  type CardApprovalBlockReason,
  type CardApprovalItem,
  type CardImportConfig,
  type CardImportItemStatus,
  type TripStatus,
  type CardImportOrganization,
  type FetchCardApprovalsRequest,
  type FetchCardApprovalsResponse,
  type FieldError,
} from '@yeojeong/shared';
import { AuditService } from '../audit/index.js';
import { ConsentChecker } from '../common/auth/index.js';
import { AppException, ValidationFailedError } from '../common/errors/index.js';
import { dateOnly, kstDate, toKstIso } from '../expenses/kst.js';
import {
  manualAmountError,
  occurredAtError,
  rankTripCandidates,
  suggestedTripOf,
  type TripCandidateInput,
} from '../expenses/manual-input.js';
import { convertToKrw, type FxSpotRate } from '../fx/convert.js';
import { SUPPORTED_CURRENCY_CODES } from '../fx/currencies.js';
import { FxRatesService } from '../fx/fx-rates.service.js';
import { Prisma } from '../generated/prisma/client.js';
import { PrismaService } from '../prisma/prisma.service.js';
import {
  approvalRowsOf,
  normalizeApprovals,
  type NormalizedApproval,
} from './approval-normalizer.js';
import { CardImportLimits } from './card-import-limits.js';
import { CodefAccountRemover } from './codef/codef-account-remover.js';
import { ImportKeyHasher } from './import-key.js';
import { ItemTokenSigner } from './item-token.js';
import { CodefClient, type CodefResponse } from './codef/codef.client.js';
import { CodefConfig } from './codef/codef.config.js';
import {
  CARD_IMPORT_ORGANIZATIONS,
  CODEF_OK,
  CODEF_PATHS,
  CODEF_TWO_WAY_REQUIRED,
  CODEF_TWO_WAY_TIMEOUT_SECONDS,
  mapCodefError,
  organizationOf,
} from './codef/codef.constants.js';
import {
  TwoWayTokenSealer,
  type CodefTwoWayInfo,
  type TwoWayState,
} from './two-way-token.js';

const DAY_MS = 86_400_000;
const SIMILAR_MS = CARD_IMPORT_SIMILAR_WINDOW_MINUTES * 60_000;

/** "2026-11-12" → UTC 자정 ms */
const dayMs = (day: string) => Date.parse(`${day}T00:00:00Z`);
const addDays = (day: string, days: number) =>
  new Date(dayMs(day) + days * DAY_MS).toISOString().slice(0, 10);
const yyyymmdd = (day: string) => day.replaceAll('-', '');

/** 접근 기록 결과 값(코드만, 내용 없음): OK · TWO_WAY_REQUIRED · 에러 코드 */
type FetchOutcome = string;

/**
 * 조회 기간 검사(기관별 상한 — codef.constants CARD_IMPORT_ORGANIZATIONS). 문제가 없으면 []
 */
export function periodErrors(
  org: CardImportOrganization,
  from: string,
  to: string,
  now: Date,
): FieldError[] {
  const today = kstDate(now);
  const errors: FieldError[] = [];
  if (from > to) {
    errors.push({
      path: 'from',
      code: 'order',
      message: '시작일이 종료일보다 늦어요',
    });
  }
  if (to > today) {
    errors.push({
      path: 'to',
      code: 'future',
      message: '오늘까지만 조회할 수 있어요',
    });
  }
  const days = (dayMs(to) - dayMs(from)) / DAY_MS + 1;
  if (from <= to && days > org.maxRangeDays) {
    errors.push({
      path: 'from',
      code: 'maxRange',
      message: `${org.name}는 한 번에 ${org.maxRangeDays}일까지 조회할 수 있어요`,
    });
  }
  if (from < addDays(today, -org.maxLookbackDays)) {
    errors.push({
      path: 'from',
      code: 'tooOld',
      message: `${org.name}는 최근 ${org.maxLookbackDays}일까지 조회할 수 있어요`,
    });
  }
  return errors;
}

/**
 * 카드 승인내역 불러오기(S8, CODEF 일회성 조회). "우리 서버에는 개인정보를 남기지 않는다":
 * - 카드사 아이디·비밀번호(암호문)는 이 요청 안에서 CODEF로 넘기기만 한다. 저장·로그·접근 기록에 남기지 않는다(로거 redaction이 한 번 더 가린다).
 * - 조회 결과는 응답으로만 돌려준다(DB에 쓰지 않는다). 사용자가 고른 것만 POST /api/wallet/entries/import로 저장된다.
 * - 승인번호 원문·카드번호 전체·가맹점 주소 등은 응답에도 넣지 않는다. 중복 판정은 importKey(HMAC)로만 한다.
 * - CODEF 계정(connectedId)은 만들지 않는다(direct). account 모드일 때도 요청 안의 지역 변수로만 쓰고 finally에서 지운다.
 * - 추가 인증 상태는 암호화 토큰으로 화면에 맡긴다(two-way-token.ts).
 */
@Injectable()
export class CardImportService {
  private readonly logger = new Logger(CardImportService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly codef: CodefClient,
    private readonly codefConfig: CodefConfig,
    private readonly sealer: TwoWayTokenSealer,
    private readonly importKeys: ImportKeyHasher,
    private readonly consents: ConsentChecker,
    private readonly audit: AuditService,
    private readonly fx: FxRatesService,
    private readonly remover: CodefAccountRemover,
    private readonly limits: CardImportLimits,
    private readonly itemTokens: ItemTokenSigner,
  ) {}

  // ─── 설정 ───

  async config(userId: string, now = new Date()): Promise<CardImportConfig> {
    const [defaultRange, missing, remainingToday] = await Promise.all([
      this.defaultRange(userId, now),
      this.consents.findMissing(userId, CARD_IMPORT_REQUIRED_CONSENTS),
      this.limits.remainingToday(userId, now),
    ]);
    return {
      enabled: true,
      publicKey: this.codefConfig.publicKey,
      publicKeyFingerprint: this.codefConfig.publicKeyFingerprint,
      organizations: CARD_IMPORT_ORGANIZATIONS.map((o) => ({ ...o })),
      maxRangeDays: CARD_IMPORT_MAX_RANGE_DAYS,
      maxLookbackDays: CARD_IMPORT_MAX_LOOKBACK_DAYS,
      defaultRange,
      consent: {
        valid: missing.length === 0,
        missing: missing.map((m) => m.id),
        required: missing,
      },
      twoWayTimeoutSeconds: CODEF_TWO_WAY_TIMEOUT_SECONDS,
      remainingToday,
    };
  }

  /** 진행 중 여정 기간(시작일 ~ 오늘), 없으면 최근 7일. 전체 상한(365일·92일)에 맞춰 자른다 */
  private async defaultRange(
    userId: string,
    now: Date,
  ): Promise<CardImportConfig['defaultRange']> {
    const today = kstDate(now);
    const ongoing = await this.prisma.trip.findFirst({
      where: {
        status: 'ONGOING',
        deletedAt: null,
        group: {
          deletedAt: null,
          memberships: { some: { userId, leftAt: null } },
        },
      },
      orderBy: { startDate: 'desc' },
      select: { id: true, startDate: true, endDate: true },
    });
    if (ongoing) {
      const end = dateOnly(ongoing.endDate);
      const to = end < today ? end : today;
      let from = dateOnly(ongoing.startDate);
      const earliest = addDays(to, -(CARD_IMPORT_MAX_RANGE_DAYS - 1));
      if (from < earliest) from = earliest;
      if (from <= to)
        return { from, to, basis: 'ONGOING_TRIP', tripId: ongoing.id };
    }
    return {
      from: addDays(today, -(CARD_IMPORT_DEFAULT_RANGE_DAYS - 1)),
      to: today,
      basis: 'RECENT_DAYS',
      tripId: null,
    };
  }

  // ─── 조회 ───

  async fetch(
    userId: string,
    request: FetchCardApprovalsRequest,
    now = new Date(),
  ): Promise<FetchCardApprovalsResponse> {
    const org = organizationOf(request.organization);
    if (!org) {
      throw new ValidationFailedError([
        {
          path: 'organization',
          code: 'isIn',
          message: '불러올 수 없는 카드사예요',
        },
      ]);
    }
    const loginRef = this.importKeys.hash(
      `card-import-login|${org.code}|${request.loginId}`,
    );
    if (
      org.requiresCardNo &&
      (!request.loginCardNo || !request.encryptedCardPassword)
    ) {
      throw new ValidationFailedError([
        {
          path: 'loginCardNo',
          code: 'required',
          message: `${org.name}는 카드번호와 카드 비밀번호가 필요해요`,
        },
      ]);
    }
    let twoWay: TwoWayState | null = null;
    if (request.twoWay) {
      twoWay = this.sealer.open(userId, request.twoWay.token, now.getTime());
      // 처음 요청과 같은 카드사·기간·아이디로만 이어 간다
      if (
        twoWay.organization !== org.code ||
        twoWay.from !== request.from ||
        twoWay.to !== request.to ||
        twoWay.loginRef !== loginRef
      ) {
        throw AppException.of('CARD_TWO_WAY_EXPIRED');
      }
    } else {
      const errors = periodErrors(org, request.from, request.to, now);
      if (errors.length > 0) throw new ValidationFailedError(errors);
    }

    // 사용자당 동시 1건(다른 요청이 진행 중이면 409). 아래 검사·조회는 모두 잠금 안에서 한다
    const release = await this.limits.acquire(userId, now);
    let started = false;
    let outcome: FetchOutcome = 'CARD_IMPORT_FAILED';
    let count = 0;
    try {
      // 새 조회만 센다: 사용자 횟수(10분 3회·하루 10회) → 로그인 쿨다운 → 서비스 일일 예산
      if (!twoWay) await this.limits.checkStart(userId, org.code, now);
      started = true;
      const response =
        this.codefConfig.loginMode === 'account'
          ? await this.queryViaAccount(org.code, request)
          : await this.query(org.code, request, twoWay);
      const code = response.result.code;
      if (code === CODEF_OK || code === CODEF_TWO_WAY_REQUIRED) {
        await this.limits.loginSucceeded(userId, org.code);
      }
      if (code === CODEF_TWO_WAY_REQUIRED) {
        if (this.codefConfig.loginMode === 'account') {
          outcome = 'CARD_TWO_WAY_UNSUPPORTED';
          throw AppException.of('CARD_TWO_WAY_UNSUPPORTED');
        }
        const result = this.twoWayRequired(
          userId,
          response,
          {
            organization: org.code,
            from: request.from,
            to: request.to,
            loginRef,
          },
          now,
        );
        outcome = 'TWO_WAY_REQUIRED';
        return result;
      }
      if (code !== CODEF_OK) {
        // CODEF 메시지는 쓰지 않고 우리 코드로만 바꾼다(결과 코드만 기록)
        const mapped = mapCodefError(code);
        outcome = mapped;
        if (mapped === 'CARD_LOGIN_FAILED') {
          await this.limits.loginFailed(userId, org.code, now);
        }
        throw AppException.of(mapped);
      }
      const { items, dropped } = normalizeApprovals(
        approvalRowsOf(response.data),
        {
          userId,
          organization: org.code,
          keyFn: (material) => this.importKeys.hash(material),
        },
      );
      if (dropped > 0) {
        this.logger.warn({ dropped }, '읽을 수 없는 승인내역 줄을 뺐다');
      }
      const enriched = await this.enrich(userId, org, items, now);
      count = enriched.length;
      outcome = 'OK';
      return {
        status: 'OK',
        organization: org.code,
        from: request.from,
        to: request.to,
        items: enriched,
      };
    } catch (error) {
      if (error instanceof AppException && outcome === 'CARD_IMPORT_FAILED') {
        outcome = error.code;
      }
      throw error;
    } finally {
      await release();
      if (started) {
        await this.recordAccess(
          userId,
          org.code,
          count,
          outcome,
          twoWay ? 'TWO_WAY' : 'START',
        );
      }
    }
  }

  /** CODEF 승인내역 요청 본문(KR_CD_P_002 입력부). 로그에 남기지 않는다 */
  private approvalBody(
    organization: string,
    request: FetchCardApprovalsRequest,
    login: { connectedId: string } | null,
  ): Record<string, unknown> {
    return {
      organization,
      ...(login
        ? { connectedId: login.connectedId }
        : {
            loginType: '1',
            id: request.loginId,
            password: request.encryptedPassword,
          }),
      // 현대·하나 아이디 로그인: 카드번호 전체 + 카드 비밀번호(RSA) — KR_CD_P_002 입력부
      ...(request.loginCardNo && request.encryptedCardPassword
        ? {
            loginCardNo: request.loginCardNo,
            cardPassword: request.encryptedCardPassword,
          }
        : {}),
      startDate: yyyymmdd(request.from),
      endDate: yyyymmdd(request.to),
      // 0 = 최신순, 1 = 전체 카드, 0 = 가맹점 부가 정보 받지 않음(주소·전화 등 불필요한 개인정보를 받지 않는다)
      orderBy: '0',
      inquiryType: '1',
      memberStoreInfoType: '0',
    };
  }

  /** direct: 로그인 정보를 승인내역 요청에 바로 넣는다. 추가 인증은 원래 파라미터 + is2Way + twoWayInfo + smsAuthNo(add-auth 가이드) */
  private query(
    organization: string,
    request: FetchCardApprovalsRequest,
    twoWay: TwoWayState | null,
  ): Promise<CodefResponse> {
    const body = this.approvalBody(organization, request, null);
    if (twoWay && request.twoWay) {
      Object.assign(body, {
        is2Way: true,
        twoWayInfo: { ...twoWay.info },
        smsAuthNo: request.twoWay.code,
      });
    }
    return this.codef.request(CODEF_PATHS.CARD_APPROVAL_LIST, body);
  }

  /**
   * account: 계정 등록 → 승인내역(connectedId) → finally 계정 삭제. connectedId는 이 함수의 지역 변수로만 쓴다(로그 없음).
   * 삭제는 요청 안에서 최대 3회, 그래도 실패하면 암호화해 삭제 대기 행으로 넘긴다(CodefAccountRemover — 삭제에만 쓴다)
   */
  private async queryViaAccount(
    organization: string,
    request: FetchCardApprovalsRequest,
  ): Promise<CodefResponse> {
    const account = {
      countryCode: 'KR',
      businessType: 'CD',
      clientType: 'P',
      organization,
      loginType: '1',
    };
    const created = await this.codef.request(CODEF_PATHS.ACCOUNT_CREATE, {
      accountList: [
        {
          ...account,
          id: request.loginId,
          password: request.encryptedPassword,
        },
      ],
    });
    const data = (created.data ?? {}) as {
      connectedId?: unknown;
      errorList?: { code?: unknown }[];
    };
    const connectedId =
      typeof data.connectedId === 'string' ? data.connectedId : null;
    try {
      const listError = Array.isArray(data.errorList)
        ? data.errorList[0]?.code
        : undefined;
      if (
        created.result.code !== CODEF_OK ||
        !connectedId ||
        typeof listError === 'string'
      ) {
        const code =
          typeof listError === 'string' ? listError : created.result.code;
        return {
          result: { code: code === CODEF_OK ? 'CF-99999' : code },
          data: null,
        };
      }
      return await this.codef.request(
        CODEF_PATHS.CARD_APPROVAL_LIST,
        this.approvalBody(organization, request, { connectedId }),
      );
    } finally {
      if (connectedId) {
        await this.remover.removeOrQueue(connectedId, organization);
      }
    }
  }

  private twoWayRequired(
    userId: string,
    response: CodefResponse,
    base: Omit<TwoWayState, 'info'>,
    now: Date,
  ): FetchCardApprovalsResponse {
    const data = (response.data ?? {}) as Record<string, unknown>;
    const info: CodefTwoWayInfo = {
      jobIndex: Number(data.jobIndex),
      threadIndex: Number(data.threadIndex),
      jti: typeof data.jti === 'string' ? data.jti : '',
      twoWayTimestamp: Number(data.twoWayTimestamp),
    };
    if (
      !Number.isFinite(info.jobIndex) ||
      !Number.isFinite(info.threadIndex) ||
      !Number.isFinite(info.twoWayTimestamp) ||
      info.jti === ''
    ) {
      throw AppException.of('CARD_IMPORT_FAILED');
    }
    // 개인 카드 승인내역의 추가 인증은 문자 인증번호뿐이다(KR_CD_P_002). 다른 수단이면 이어갈 수 없다
    if (data.method !== 'smsAuthNo')
      throw AppException.of('CARD_TWO_WAY_UNSUPPORTED');
    const expiresAt = new Date(
      now.getTime() + CODEF_TWO_WAY_TIMEOUT_SECONDS * 1000,
    );
    return {
      status: 'TWO_WAY_REQUIRED',
      twoWayToken: this.sealer.seal(userId, { ...base, info }, expiresAt),
      method: 'SMS',
      expiresAt: toKstIso(expiresAt),
    };
  }

  // ─── 결과 보강(지갑 상태·환율 추정) ───

  private async enrich(
    userId: string,
    org: CardImportOrganization,
    items: NormalizedApproval[],
    now: Date,
  ): Promise<CardApprovalItem[]> {
    if (items.length === 0) return [];
    const times = items.map((i) => i.approvedAt.getTime());
    const [imported, manual] = await Promise.all([
      this.prisma.transaction.findMany({
        where: {
          userId,
          source: 'CARD_IMPORT',
          externalRef: { in: items.map((i) => i.importKey) },
        },
        select: { externalRef: true },
      }),
      this.prisma.transaction.findMany({
        where: {
          userId,
          source: 'MANUAL',
          occurredAt: {
            gte: new Date(Math.min(...times) - SIMILAR_MS),
            lte: new Date(Math.max(...times) + SIMILAR_MS),
          },
        },
        select: {
          id: true,
          occurredAt: true,
          originalAmount: true,
          originalCurrency: true,
        },
      }),
    ]);
    const importedKeys = new Set(imported.map((t) => t.externalRef));
    const spotCache = new Map<string, FxSpotRate | null>();
    const trips = await this.tripOptions(userId);

    const result: CardApprovalItem[] = [];
    for (const item of items) {
      const alreadyImported = importedKeys.has(item.importKey);
      const live =
        item.cancelState === 'NONE' || item.cancelState === 'PARTIAL';
      const similar =
        live && !alreadyImported ? closestSimilar(item, manual) : null;
      let blockReason: CardApprovalBlockReason | null = null;
      if (item.cancelState === 'CANCELLED') blockReason = 'CANCELLED';
      else if (item.cancelState === 'ORPHAN_CANCEL')
        blockReason = 'ORPHAN_CANCEL';
      else if (alreadyImported) blockReason = 'ALREADY_IMPORTED';
      else if (!SUPPORTED_CURRENCY_CODES.includes(item.currency))
        blockReason = 'UNSUPPORTED_CURRENCY';
      else if (manualAmountError(item.amount, item.currency))
        blockReason = 'INVALID_AMOUNT';
      else if (occurredAtError(item.approvedAt, now)) blockReason = 'TOO_OLD';
      const selectable = blockReason === null;
      // 저장 때 서버가 같은 규칙으로 다시 고른다(직접 입력의 자동 연결 — 4-11-3)
      const inTripId = live
        ? (suggestedTripOf(rankTripCandidates(trips, item.approvedAt))
            ?.tripId ?? null)
        : null;
      result.push({
        importKey: item.importKey,
        approvedAt: toKstIso(item.approvedAt),
        amount: item.amount,
        currency: item.currency,
        krwAmount: item.krwAmount,
        estimatedKrwAmount:
          item.krwAmount === null && item.currency !== 'KRW'
            ? await this.estimate(item, spotCache)
            : null,
        merchantName: item.merchantName,
        overseas: item.overseas,
        organization: org.code,
        organizationName: org.name,
        cardLast4: item.cardLast4,
        cardName: item.cardName,
        status: statusOf(item, alreadyImported, similar),
        cancelState: item.cancelState,
        partialCancelAmount: item.partialCancelAmount,
        alreadyImported,
        similarManualEntryId: similar,
        inTripId,
        selectable,
        // 4-12-4: NEW·부분 취소는 여정 기간 안일 때만 기본 선택, 비슷한 기록은 기본 해제
        defaultSelected: selectable && similar === null && inTripId !== null,
        blockReason,
        itemToken: selectable
          ? this.itemTokens.sign(
              userId,
              {
                importKey: item.importKey,
                occurredAt: toKstIso(item.approvedAt),
                amount: item.amount,
                currency: item.currency,
                merchantName: item.merchantName,
                krwAmount: item.krwAmount,
              },
              now.getTime(),
            )
          : null,
      });
    }
    return result;
  }

  /**
   * 카드사 원화가 없는 외화의 "약 ₩" 추정: 지갑 환산 규칙(4-11-6)과 같이 지금 기준 최신 매매기준율(통화별로 한 번만 찾는다, 이 요청 안에서만 캐시).
   * 고시가 없거나 지원하지 않는 통화면 null
   */
  private async estimate(
    item: NormalizedApproval,
    cache: Map<string, FxSpotRate | null>,
  ): Promise<number | null> {
    if (!SUPPORTED_CURRENCY_CODES.includes(item.currency)) return null;
    let spot = cache.get(item.currency);
    if (spot === undefined) {
      spot = await this.fx.findSpotRate(item.currency, new Date());
      cache.set(item.currency, spot);
    }
    if (!spot) return null;
    try {
      return convertToKrw({
        amount: item.amount,
        currency: item.currency,
        policy: 'SPOT_AT_PAYMENT',
        spot,
      }).krwAmount;
    } catch {
      return null;
    }
  }

  /** 자동 연결 후보: 내가 활성 멤버인 예정·진행 중 여정(WalletService.tripOptions와 같은 조건) */
  private async tripOptions(userId: string): Promise<TripCandidateInput[]> {
    const trips = await this.prisma.trip.findMany({
      where: {
        status: { in: ['UPCOMING', 'ONGOING'] },
        deletedAt: null,
        group: {
          deletedAt: null,
          memberships: { some: { userId, leftAt: null } },
        },
      },
      select: {
        id: true,
        status: true,
        currency: true,
        startAt: true,
        autoEndAt: true,
      },
    });
    return trips.map((t) => ({
      tripId: t.id,
      status: t.status as TripStatus,
      currency: t.currency,
      startAt: t.startAt,
      autoEndAt: t.autoEndAt,
    }));
  }

  // ─── 제한·기록 ───

  /** 접근 기록: 기관 코드·건수·결과 코드만(아이디·금액·가맹점 없음). 기록 실패는 응답을 막지 않는다 */
  private async recordAccess(
    userId: string,
    organization: string,
    count: number,
    outcome: string,
    step: 'START' | 'TWO_WAY',
  ) {
    try {
      await this.audit.record({
        userId,
        action: 'FETCH_CARD_APPROVALS',
        resourceType: 'USER',
        resourceId: userId,
        details: { organization, count, result: outcome, step },
      });
    } catch (error) {
      this.logger.error(
        { errorCode: (error as { code?: string }).code },
        '카드 승인내역 접근 기록을 남기지 못함',
      );
    }
  }
}

/** 같은 통화·같은 금액, ±30분 안의 직접 입력 지갑 항목 중 시각이 가장 가까운 것 */
function closestSimilar(
  item: NormalizedApproval,
  manual: {
    id: string;
    occurredAt: Date;
    originalAmount: Prisma.Decimal;
    originalCurrency: string;
  }[],
): string | null {
  let best: { id: string; diff: number } | null = null;
  for (const m of manual) {
    if (m.originalCurrency !== item.currency) continue;
    if (!m.originalAmount.equals(item.amount)) continue;
    const diff = Math.abs(m.occurredAt.getTime() - item.approvedAt.getTime());
    if (diff > SIMILAR_MS) continue;
    if (!best || diff < best.diff) best = { id: m.id, diff };
  }
  return best?.id ?? null;
}

/** 화면 칩(4-12-4): ALREADY_IMPORTED > CANCELLED(원 승인 없는 취소 포함) > SIMILAR > PARTIAL_CANCEL > NEW */
export function statusOf(
  item: Pick<NormalizedApproval, 'cancelState'>,
  alreadyImported: boolean,
  similar: string | null,
): CardImportItemStatus {
  if (alreadyImported) return 'ALREADY_IMPORTED';
  if (
    item.cancelState === 'CANCELLED' ||
    item.cancelState === 'ORPHAN_CANCEL'
  ) {
    return 'CANCELLED';
  }
  if (similar) return 'SIMILAR';
  if (item.cancelState === 'PARTIAL') return 'PARTIAL_CANCEL';
  return 'NEW';
}
