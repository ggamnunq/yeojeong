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
  isValidCardNumber,
} from '@yeojeong/shared';
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
import { convertToKrw } from '../fx/convert.js';
import { SUPPORTED_CURRENCY_CODES } from '../fx/currencies.js';
import { FxRatesService, type SpotRateTable } from '../fx/fx-rates.service.js';
import { Prisma } from '../generated/prisma/client.js';
import { PrismaService } from '../prisma/prisma.service.js';
import {
  approvalRowsOf,
  normalizeApprovals,
  type NormalizedApproval,
} from './approval-normalizer.js';
import {
  CardImportLimits,
  TWO_WAY_MAX_ATTEMPTS,
  type BudgetReservation,
  type TwoWayAttempt,
} from './card-import-limits.js';
import { CodefAccountRemover } from './codef/codef-account-remover.js';
import { ImportKeyHasher } from './import-key.js';
import { ItemTokenSigner } from './item-token.js';
import { CodefClient, type CodefResponse } from './codef/codef.client.js';
import { CodefConfig } from './codef/codef.config.js';
import {
  CODEF_NOT_USER_FAILURES,
  CODEF_OK,
  CODEF_PATHS,
  CODEF_TWO_WAY_REQUIRED,
  CODEF_TWO_WAY_TIMEOUT_SECONDS,
  cardImportOrganizations,
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
 * 조회 기간 검사(기관별 상한 — codef.constants ALL_CARD_ORGANIZATIONS). 문제가 없으면 []
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
      organizations: cardImportOrganizations(
        this.codefConfig.cardNumberLogin,
      ).map((o) => ({ ...o })),
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
    const org = organizationOf(
      request.organization,
      this.codefConfig.cardNumberLogin,
    );
    if (!org) {
      throw new ValidationFailedError([
        {
          path: 'organization',
          code: 'isIn',
          message: '불러올 수 없는 카드사예요',
        },
      ]);
    }
    this.checkLoginFields(org, request);
    const loginRef = this.importKeys.hash(
      `card-import-login|${org.code}|${request.loginId}`,
    );
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

    // 사용자당 동시 1건(다른 요청이 진행 중이면 409). 아래 검사·기록·조회는 모두 잠금 안에서 한다
    const release = await this.limits.acquire(userId, now);
    const step = twoWay ? 'TWO_WAY' : 'START';
    let attemptLogId: string | null = null;
    let reservation: BudgetReservation | null = null;
    let session: TwoWayAttempt | null = null;
    /** 이 요청에서 예약분으로 쓴 CODEF 호출 수(계정 삭제 제외) */
    const used = { calls: 0 };
    /** 이 요청이 예산에서 미리 확보한 호출 수(새 조회 = 예약 4, 이어가기 = 1) */
    let budgeted = 0;
    let keepSession = false;
    let outcome: FetchOutcome = 'CARD_IMPORT_FAILED';
    let count = 0;
    try {
      if (twoWay) {
        // 같은 토큰은 3번까지, 예약 범위 안에서만(원자적으로 시도 +1·예약 −1)
        session = await this.limits.consumeTwoWay(userId, twoWay.nonce, now);
        budgeted = 1;
      } else {
        // 새 조회: 사용자 횟수·쿨다운 → 예산 예약(원자적) → 시도 기록(사용자 횟수의 기준)
        // 현대·하나는 잠김 위험 카운터(2 이상이면 성공할 때까지 잠금, 1이면 확인 필요)
        await this.limits.checkStart(
          userId,
          org.code,
          now,
          org.requiresCardNo
            ? { acknowledged: request.acknowledgeLockRisk === true }
            : undefined,
        );
        reservation = await this.limits.reserveFetch(now);
        budgeted = reservation.calls;
      }
      attemptLogId = await this.limits.recordAttempt(userId, org.code, step);

      const response =
        this.codefConfig.loginMode === 'account'
          ? await this.queryViaAccount(org.code, request, used)
          : await this.query(org.code, request, twoWay, used);
      const code = response.result.code;
      // 현대·하나는 추가 인증이 없는 카드사다(KR_CD_P_002 2-way 안내). 오면 이어가지 않고 오류로 끝낸다(로그인 성공으로도 보지 않는다)
      if (code === CODEF_TWO_WAY_REQUIRED && org.requiresCardNo) {
        outcome = 'CARD_TWO_WAY_UNSUPPORTED';
        throw AppException.of('CARD_TWO_WAY_UNSUPPORTED');
      }
      if (code === CODEF_OK || code === CODEF_TWO_WAY_REQUIRED) {
        await this.limits.loginSucceeded(userId, org.code);
      }
      if (code === CODEF_TWO_WAY_REQUIRED) {
        if (this.codefConfig.loginMode === 'account') {
          outcome = 'CARD_TWO_WAY_UNSUPPORTED';
          throw AppException.of('CARD_TWO_WAY_UNSUPPORTED');
        }
        const info = this.twoWayInfoOf(response);
        const expiresAt = new Date(
          now.getTime() + CODEF_TWO_WAY_TIMEOUT_SECONDS * 1000,
        );
        let nonce: string;
        if (twoWay && session) {
          // 같은 이어가기의 다음 단계: 같은 행(시도 수·남은 예약)을 그대로 쓴다
          nonce = twoWay.nonce;
          keepSession =
            session.attempts < TWO_WAY_MAX_ATTEMPTS && session.callsLeft > 0;
        } else {
          const callsLeft = Math.max((reservation?.calls ?? 0) - used.calls, 0);
          nonce = await this.limits.openTwoWay(
            userId,
            { day: (reservation as BudgetReservation).day, callsLeft },
            expiresAt,
          );
          // 남은 예약은 이어가기 행이 들고 간다
          reservation = null;
          keepSession = true;
        }
        if (!keepSession) throw AppException.of('CARD_TWO_WAY_EXPIRED');
        outcome = 'TWO_WAY_REQUIRED';
        return {
          status: 'TWO_WAY_REQUIRED',
          twoWayToken: this.sealer.seal(
            userId,
            {
              organization: org.code,
              from: request.from,
              to: request.to,
              loginRef,
              nonce,
              info,
            },
            expiresAt,
          ),
          method: 'SMS',
          expiresAt: toKstIso(expiresAt),
        };
      }
      if (code !== CODEF_OK) {
        // CODEF 메시지는 쓰지 않고 우리 코드로만 바꾼다(결과 코드만 기록)
        const mapped = mapCodefError(code);
        outcome = mapped;
        // 인증번호만 틀렸으면 같은 토큰으로 다시(시도 3회 안에서)
        keepSession =
          mapped === 'CARD_TWO_WAY_INVALID' &&
          session !== null &&
          session.attempts < TWO_WAY_MAX_ATTEMPTS &&
          session.callsLeft > 0;
        // 아이디·비밀번호·카드번호·카드 비밀번호 오류는 연속 실패로 센다(카드사 계정 잠김 예방).
        // 현대·하나는 잠김 위험 카운터(성공해야 0, 2회면 잠금)로 세고, 매핑 밖 CODEF 오류도 센다(미입력·토큰 오류 제외)
        if (
          mapped === 'CARD_LOGIN_FAILED' ||
          mapped === 'CARD_NUMBER_INVALID' ||
          mapped === 'CARD_PASSWORD_INVALID' ||
          (org.requiresCardNo &&
            mapped === 'CARD_IMPORT_FAILED' &&
            !CODEF_NOT_USER_FAILURES.has(code))
        ) {
          await this.limits.loginFailed(userId, org.code, now, mapped, {
            lockRisk: org.requiresCardNo,
          });
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
      // 결과 기록이 실패하면 결과를 돌려주지 않는다(fail closed)
      await this.limits.finishAttempt(attemptLogId, {
        organization: org.code,
        count,
        result: outcome,
        step,
      });
      attemptLogId = null;
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
      try {
        if (session && !keepSession)
          await this.limits.closeTwoWay(session.nonceHash);
        // 예약(새 조회 4, 이어가기 1)을 넘긴 실제 호출(토큰 재시도로 2번 간 경우)은 따로 센다
        for (let i = budgeted; i < used.calls; i += 1) {
          await this.limits.recordCodefCall();
        }
        // 남은 예약은 돌려준다(추가 인증으로 넘어갔으면 이어가기 행이 들고 있다)
        if (reservation) {
          await this.limits.refund(
            reservation.day,
            Math.max(reservation.calls - used.calls, 0),
          );
        }
        if (attemptLogId) {
          await this.limits.finishAttempt(attemptLogId, {
            organization: org.code,
            count,
            result: outcome,
            step,
          });
        }
      } finally {
        await release();
      }
    }
  }

  /**
   * 카드번호 로그인 필드: 지금 받는 카드사가 그것을 요구할 때만(현대·하나 — env CARD_NUMBER_LOGIN이 켜져 있어야 org가 나온다) 받는다. 아니면 400.
   * 카드번호는 숫자 14~19자리 + Luhn(isValidCardNumber)일 때만 받는다. 에러에는 값을 넣지 않는다(경로·코드·고정 문구만).
   * 암호문은 공개키 모듈러스 길이(2048비트 = 256바이트)와 같은 길이일 때만 받는다(평문·다른 키로 만든 값 거절)
   */
  private checkLoginFields(
    org: CardImportOrganization,
    request: FetchCardApprovalsRequest,
  ) {
    const errors: FieldError[] = [];
    const cardLogin = org.requiresCardNo;
    if (!cardLogin && (request.loginCardNo || request.encryptedCardPassword)) {
      errors.push({
        path: 'loginCardNo',
        code: 'notAllowed',
        message: '이 카드사는 카드번호를 받지 않아요',
      });
    }
    if (cardLogin && (!request.loginCardNo || !request.encryptedCardPassword)) {
      errors.push({
        path: 'loginCardNo',
        code: 'required',
        message: `${org.name}는 카드번호와 카드 비밀번호가 필요해요`,
      });
    }
    if (
      cardLogin &&
      request.loginCardNo !== undefined &&
      !isValidCardNumber(request.loginCardNo)
    ) {
      errors.push({
        path: 'loginCardNo',
        code: 'cardNumber',
        message: '카드번호를 다시 확인해 주세요',
      });
    }
    const expected = this.codefConfig.modulusBytes;
    for (const path of [
      'encryptedPassword',
      'encryptedCardPassword',
    ] as const) {
      const value = request[path];
      if (value === undefined) continue;
      if (
        expected === null ||
        Buffer.from(value, 'base64').length !== expected
      ) {
        errors.push({
          path,
          code: 'ciphertext',
          message: '다시 시도해 주세요',
        });
      }
    }
    if (errors.length > 0) throw new ValidationFailedError(errors);
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
      // 현대·하나 아이디 로그인: 카드번호 전체(원문 — CODEF가 암호화 없이 받는다) + 카드 비밀번호(RSA) — KR_CD_P_002 입력부.
      // 이 본문은 CODEF 호출에만 쓰고 로그·저장하지 않는다. 카드번호는 loginRef·importKey·itemToken 재료에도 넣지 않는다
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
    used: { calls: number },
  ): Promise<CodefResponse> {
    const body = this.approvalBody(organization, request, null);
    if (twoWay && request.twoWay) {
      Object.assign(body, {
        is2Way: true,
        twoWayInfo: { ...twoWay.info },
        smsAuthNo: request.twoWay.code,
      });
    }
    return this.counted(used, CODEF_PATHS.CARD_APPROVAL_LIST, body);
  }

  /** 예약분으로 쓰는 CODEF 호출. 보내기 전에 1을 세고(실패해도 쓴 것으로), 토큰 재시도로 2번 갔으면 더 센다 */
  private async counted(
    used: { calls: number },
    path: string,
    body: Record<string, unknown>,
  ): Promise<CodefResponse> {
    used.calls += 1;
    const response = await this.codef.request(path, body);
    used.calls += Math.max((response.calls ?? 1) - 1, 0);
    return response;
  }

  /**
   * account: 계정 등록 → 승인내역(connectedId) → finally 계정 삭제. connectedId는 이 함수의 지역 변수로만 쓴다(로그 없음).
   * 삭제는 요청 안에서 최대 3회, 그래도 실패하면 암호화해 삭제 대기 행으로 넘긴다(CodefAccountRemover — 삭제에만 쓴다)
   */
  private async queryViaAccount(
    organization: string,
    request: FetchCardApprovalsRequest,
    used: { calls: number },
  ): Promise<CodefResponse> {
    const account = {
      countryCode: 'KR',
      businessType: 'CD',
      clientType: 'P',
      organization,
      loginType: '1',
    };
    const created = await this.counted(used, CODEF_PATHS.ACCOUNT_CREATE, {
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
      return await this.counted(
        used,
        CODEF_PATHS.CARD_APPROVAL_LIST,
        this.approvalBody(organization, request, { connectedId }),
      );
    } finally {
      if (connectedId) {
        await this.remover.removeOrQueue(connectedId, organization);
      }
    }
  }

  /** CF-03002 응답의 이어가기 값(add-auth 가이드). 형식이 다르거나 문자 인증이 아니면 이어갈 수 없다 */
  private twoWayInfoOf(response: CodefResponse): CodefTwoWayInfo {
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
    if (data.method !== 'smsAuthNo') {
      throw AppException.of('CARD_TWO_WAY_UNSUPPORTED');
    }
    return info;
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
    const rates = await this.spotRatesFor(items);
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
      const estimatedKrwAmount = estimateKrw(item, rates);
      result.push({
        importKey: item.importKey,
        approvedAt: toKstIso(item.approvedAt),
        amount: item.amount,
        currency: item.currency,
        krwAmount: item.krwAmount,
        ...(estimatedKrwAmount !== null && { estimatedKrwAmount }),
        merchantName: item.merchantName,
        overseas: item.overseas,
        organization: org.code,
        organizationName: org.name,
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

  /** 추정이 필요한 외화(카드사 원화 없음)의 고시 표: 승인 시각 구간 + 그 직전 고시(한 번에 읽는다) */
  private async spotRatesFor(
    items: NormalizedApproval[],
  ): Promise<SpotRateTable | null> {
    const needed = items.filter(
      (i) =>
        i.krwAmount === null &&
        i.currency !== 'KRW' &&
        SUPPORTED_CURRENCY_CODES.includes(i.currency),
    );
    if (needed.length === 0) return null;
    const times = needed.map((i) => i.approvedAt.getTime());
    return this.fx.loadSpotTable(
      needed.map((i) => i.currency),
      new Date(Math.min(...times)),
      new Date(Math.max(...times)),
    );
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

/**
 * "약 ₩" 추정: 승인 시각 기준 시장 환율(4-5 SPOT_AT_PAYMENT, 저장 때 여정 통화가 아닌 외화 환산과 같은 기준).
 * effectiveAt ≤ 승인 시각인 가장 최근 고시만 쓴다(표의 "가장 이른 고시" 대체는 쓰지 않는다). 없으면 null(필드 생략)
 */
export function estimateKrw(
  item: Pick<
    NormalizedApproval,
    'amount' | 'currency' | 'krwAmount' | 'approvedAt'
  >,
  rates: Pick<SpotRateTable, 'find'> | null,
): number | null {
  if (item.krwAmount !== null || item.currency === 'KRW' || !rates) return null;
  const spot = rates.find(item.currency, item.approvedAt);
  if (!spot || spot.effectiveAt.getTime() > item.approvedAt.getTime()) {
    return null;
  }
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
