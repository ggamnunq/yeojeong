import { timingSafeEqual, randomBytes } from 'node:crypto';
import { Injectable, Logger } from '@nestjs/common';
import {
  SIGNUP_REQUIRED_CONSENTS,
  type AuthSessionResponse,
  type SignupResponse,
} from '@yeojeong/shared';
import type { Request, Response } from 'express';
import { AuthConfig } from '../common/auth/auth-config.js';
import {
  LOGIN_STATE_COOKIE,
  LOGIN_STATE_PURPOSE,
  SIGNUP_COOKIE,
  SIGNUP_PURPOSE,
} from '../common/auth/auth.constants.js';
import { ConsentChecker } from '../common/auth/consent-checker.js';
import {
  LOGIN_STATE_TTL_SECONDS,
  SIGNUP_TTL_SECONDS,
  clearCookie,
  setCookie,
} from '../common/auth/cookies.js';
import {
  SessionService,
  readCookie,
  type SessionState,
} from '../common/auth/session-resolver.js';
import { WebConfig } from '../common/auth/web-config.js';
import {
  AppException,
  UnauthenticatedError,
} from '../common/errors/app-exception.js';
import { Prisma } from '../generated/prisma/client.js';
import {
  ConsentsService,
  consentEvidence,
} from '../consents/consents.service.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { assertNickname } from '../users/nickname.js';
import { UsersService } from '../users/users.service.js';
import { FeatureFlags } from '../common/features.js';
import type { ReconsentDto, SignupDto } from './dto/auth.dto.js';
import {
  KakaoClient,
  KakaoError,
  type KakaoProfile,
} from './kakao/kakao.client.js';

/** 화면 경로(화면명세 WF-02·03) */
export const WEB_PATHS = {
  home: '/',
  signupNickname: '/signup/nickname',
  loginCancelled: '/login?error=cancelled',
  loginFailed: '/login?error=failed',
} as const;

const KAKAO_NICKNAME_MAX = 64;
const RETURN_TO_MAX = 512;

/** 가입 대기 쿠키(서명) 값 */
interface SignupCookieValue {
  /** SignupTicket id */
  t: string;
  /** 로그인 시작 때 받은 돌아갈 화면 경로(safeReturnTo를 거친 값) */
  r: string | null;
}

interface OAuthState {
  /** state 원문 */
  s: string;
  /** 로그인 후 돌아갈 화면 경로 */
  r: string | null;
}

/** 같은 origin의 화면 경로만 받는다(오픈 리다이렉트 방지). 아니면 null */
export function safeReturnTo(value: unknown): string | null {
  if (typeof value !== 'string' || value.length > RETURN_TO_MAX) return null;
  if (!value.startsWith('/') || value.startsWith('//')) return null;
  if (/[\\\p{Cc}]/u.test(value)) return null;
  if (value.startsWith('/api/') || value === '/api') return null;
  return value;
}

function sameString(a: string, b: string) {
  const left = Buffer.from(a);
  const right = Buffer.from(b);
  return left.length === right.length && timingSafeEqual(left, right);
}

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: AuthConfig,
    private readonly web: WebConfig,
    private readonly sessions: SessionService,
    private readonly kakao: KakaoClient,
    private readonly consents: ConsentsService,
    private readonly checker: ConsentChecker,
    private readonly users: UsersService,
    private readonly features: FeatureFlags,
  ) {}

  /** 카카오 인가 페이지 주소. state·returnTo는 서명 쿠키에 담는다(10분) */
  startKakao(res: Response, returnTo: unknown): string {
    const state = randomBytes(32).toString('base64url');
    const value: OAuthState = { s: state, r: safeReturnTo(returnTo) };
    setCookie(
      res,
      this.web,
      LOGIN_STATE_COOKIE,
      this.config.signer.sign(
        LOGIN_STATE_PURPOSE,
        value,
        LOGIN_STATE_TTL_SECONDS,
      ),
      LOGIN_STATE_TTL_SECONDS * 1000,
    );
    return this.kakao.authorizeUrl(state);
  }

  /**
   * 카카오 콜백. state가 쿠키와 다르면 400(세션을 만들지 않는다).
   * 기존 회원이면 프사 갱신 + 세션 → 돌아갈 화면, 신규면 가입 대기(30분) → 닉네임 화면. 돌려줄 값은 화면 경로.
   */
  async completeKakao(
    req: Request,
    res: Response,
    query: { code?: unknown; state?: unknown; error?: unknown },
  ): Promise<string> {
    const stored = this.config.signer.verify<OAuthState>(
      LOGIN_STATE_PURPOSE,
      readCookie(req, LOGIN_STATE_COOKIE),
    );
    clearCookie(res, this.web, LOGIN_STATE_COOKIE);
    if (
      !stored ||
      typeof query.state !== 'string' ||
      !sameString(stored.s, query.state)
    ) {
      throw AppException.of('BAD_REQUEST', {
        message: '로그인 요청이 만료됐어요. 다시 시도해 주세요',
      });
    }
    if (query.error !== undefined) {
      return query.error === 'access_denied'
        ? WEB_PATHS.loginCancelled
        : WEB_PATHS.loginFailed;
    }
    if (typeof query.code !== 'string' || query.code.length === 0) {
      return WEB_PATHS.loginFailed;
    }

    let profile: KakaoProfile;
    try {
      profile = await this.kakao.fetchProfile(query.code);
    } catch (error) {
      if (!(error instanceof KakaoError)) throw error;
      // 인가 코드·토큰·회원번호는 남기지 않는다
      this.logger.warn(
        {
          stage: error.stage,
          status: error.status,
          kakaoCode: error.kakaoCode,
        },
        '카카오 로그인 실패',
      );
      return WEB_PATHS.loginFailed;
    }

    // 다른 계정으로 로그인한 상태였다면 그 세션은 끝낸다
    await this.sessions.revokeCurrent(req, res);

    const user = await this.prisma.user.findUnique({
      where: { kakaoId: profile.id },
      select: { id: true },
    });
    if (user) {
      const now = new Date();
      await this.prisma.user.update({
        where: { id: user.id },
        data: {
          profileImageUrl: profile.profileImageUrl,
          profileImageSyncedAt: now,
          lastLoginAt: now,
        },
      });
      await this.sessions.issue(res, user.id);
      clearCookie(res, this.web, SIGNUP_COOKIE);
      this.logger.log({ userId: user.id }, '로그인');
      return stored.r ?? WEB_PATHS.home;
    }

    const ticket = await this.prisma.$transaction(async (tx) => {
      await tx.signupTicket.deleteMany({ where: { kakaoId: profile.id } });
      return tx.signupTicket.create({
        data: {
          kakaoId: profile.id,
          // varchar(64)는 코드 포인트 수로 센다
          kakaoNickname: profile.nickname
            ? Array.from(profile.nickname).slice(0, KAKAO_NICKNAME_MAX).join('')
            : null,
          profileImageUrl: profile.profileImageUrl,
          expiresAt: new Date(Date.now() + SIGNUP_TTL_SECONDS * 1000),
        },
        select: { id: true },
      });
    });
    // 신규 회원도 로그인 시작 때의 returnTo(예: /join?code=…)를 잃지 않게 가입 대기 쿠키에 함께 담는다
    const pending: SignupCookieValue = { t: ticket.id, r: stored.r };
    setCookie(
      res,
      this.web,
      SIGNUP_COOKIE,
      this.config.signer.sign(SIGNUP_PURPOSE, pending, SIGNUP_TTL_SECONDS),
      SIGNUP_TTL_SECONDS * 1000,
    );
    return WEB_PATHS.signupNickname;
  }

  /** FR-102: 로그인 여부·가입 단계·재동의 필요 여부 */
  async session(
    state: SessionState,
    req: Request,
  ): Promise<AuthSessionResponse> {
    const features = this.features.view(
      state.status === 'AUTHENTICATED' ? state.user.id : null,
    );
    if (state.status === 'AUTHENTICATED') {
      const [user, reconsentRequired] = await Promise.all([
        this.users.me(state.user.id),
        this.checker.findMissing(state.user.id, SIGNUP_REQUIRED_CONSENTS),
      ]);
      return { status: 'AUTHENTICATED', user, reconsentRequired, features };
    }
    const ticket = await this.findTicket(req);
    if (ticket) {
      return {
        status: 'SIGNUP_REQUIRED',
        signupDraft: {
          kakaoNickname: ticket.kakaoNickname,
          profileImageUrl: ticket.profileImageUrl,
          returnTo: ticket.returnTo,
        },
        features,
      };
    }
    return { status: 'ANONYMOUS', features };
  }

  /**
   * FR-103·104: 닉네임 + 필수 동의(TOS·PRIVACY·AGE14) → User + UserConsent + 세션을 한 트랜잭션으로.
   * 같은 카카오 계정이 이미 가입돼 있으면(다른 탭) 그 계정으로 세션만 발급한다(created=false).
   */
  async signup(
    req: Request,
    res: Response,
    dto: SignupDto,
  ): Promise<{ me: SignupResponse; created: boolean }> {
    const ticket = await this.findTicket(req);
    if (!ticket) {
      throw new UnauthenticatedError(
        '가입 시간이 지났어요. 다시 로그인해 주세요',
      );
    }
    const nickname = assertNickname(dto.nickname);
    const { documents } = await this.consents.check(
      'SIGNUP',
      dto.agreements,
      SIGNUP_REQUIRED_CONSENTS,
    );
    const evidence = consentEvidence(req);

    const existing = await this.prisma.user.findUnique({
      where: { kakaoId: ticket.kakaoId },
      select: { id: true },
    });
    if (existing) return this.finishExisting(req, res, existing.id, ticket);

    try {
      const userId = await this.prisma.$transaction(async (tx) => {
        const now = new Date();
        const user = await tx.user.create({
          data: {
            kakaoId: ticket.kakaoId,
            nickname,
            profileImageUrl: ticket.profileImageUrl,
            profileImageSyncedAt: now,
            lastLoginAt: now,
          },
          select: { id: true },
        });
        await this.consents.record(tx, {
          userId: user.id,
          documents,
          screen: 'WF-04',
          method: dto.method,
          evidence,
        });
        await tx.signupTicket.delete({ where: { id: ticket.id } });
        await this.sessions.issue(res, user.id, tx);
        return user.id;
      });
      clearCookie(res, this.web, SIGNUP_COOKIE);
      this.logger.log({ userId }, '가입');
      return {
        me: { ...(await this.users.me(userId)), returnTo: ticket.returnTo },
        created: true,
      };
    } catch (error) {
      // 같은 순간 다른 탭에서 가입이 끝난 경우
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2002'
      ) {
        const user = await this.prisma.user.findUnique({
          where: { kakaoId: ticket.kakaoId },
          select: { id: true },
        });
        if (user) return this.finishExisting(req, res, user.id, ticket);
      }
      throw error;
    }
  }

  /** FR-107: 빠진 가입 필수 동의를 현재 버전으로 다시 받는다 */
  async reconsent(userId: string, req: Request, dto: ReconsentDto) {
    const missing = await this.checker.findMissing(
      userId,
      SIGNUP_REQUIRED_CONSENTS,
    );
    const { documents } = await this.consents.check(
      'SIGNUP',
      dto.agreements,
      missing.map((m) => m.id),
    );
    if (documents.length === 0) return;
    await this.prisma.$transaction((tx) =>
      this.consents.record(tx, {
        userId,
        documents,
        screen: 'RECONSENT',
        method: dto.method,
        evidence: consentEvidence(req),
      }),
    );
  }

  /** FR-106: 이 기기 세션만 끝낸다. 가입 대기 쿠키도 지운다 */
  async logout(req: Request, res: Response) {
    await this.sessions.revokeCurrent(req, res);
    clearCookie(res, this.web, SIGNUP_COOKIE);
  }

  private async finishExisting(
    req: Request,
    res: Response,
    userId: string,
    ticket: { id: string; returnTo: string | null },
  ) {
    await this.prisma.signupTicket.deleteMany({ where: { id: ticket.id } });
    await this.sessions.revokeCurrent(req, res);
    await this.sessions.issue(res, userId);
    clearCookie(res, this.web, SIGNUP_COOKIE);
    return {
      me: { ...(await this.users.me(userId)), returnTo: ticket.returnTo },
      created: false,
    };
  }

  private async findTicket(req: Request) {
    const pending = this.sessions.signupCookie(req);
    if (!pending) return null;
    const ticket = await this.prisma.signupTicket.findFirst({
      where: { id: pending.ticketId, expiresAt: { gt: new Date() } },
      select: {
        id: true,
        kakaoId: true,
        kakaoNickname: true,
        profileImageUrl: true,
      },
    });
    // 서명된 값이지만 오픈 리다이렉트를 막는 검사를 한 번 더 거친다
    return ticket
      ? { ...ticket, returnTo: safeReturnTo(pending.returnTo) }
      : null;
  }
}
