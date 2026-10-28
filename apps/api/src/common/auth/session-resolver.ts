import { createHash, randomBytes } from 'node:crypto';
import { Injectable } from '@nestjs/common';
import { parse as parseCookie } from 'cookie';
import type { Request, Response } from 'express';
import type { Prisma } from '../../generated/prisma/client.js';
import { PrismaService } from '../../prisma/prisma.service.js';
import type { AuthSession, AuthUser } from './auth-context.js';
import { AuthConfig } from './auth-config.js';
import {
  SESSION_COOKIE,
  SIGNUP_COOKIE,
  SIGNUP_PURPOSE,
} from './auth.constants.js';
import {
  SESSION_REFRESH_BEFORE_MS,
  SESSION_TTL_MS,
  clearCookie,
  setCookie,
} from './cookies.js';
import { WebConfig } from './web-config.js';

export type SessionState =
  | { status: 'AUTHENTICATED'; user: AuthUser; session: AuthSession }
  | { status: 'SIGNUP_REQUIRED' }
  | { status: 'ANONYMOUS' };

/**
 * 요청의 쿠키로 로그인 상태를 판단한다. AuthGuard가 요청마다 한 번 부른다.
 * 테스트는 test/auth-helpers.ts의 StubSessionResolver로 바꿔 끼운다.
 */
export abstract class SessionResolver {
  abstract resolve(req: Request, res: Response): Promise<SessionState>;
}

// 세션 토큰은 32바이트 난수의 base64url(43자)
const SESSION_TOKEN = /^[A-Za-z0-9_-]{43}$/;
const LAST_SEEN_INTERVAL_MS = 60 * 60_000;
const UUID =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function readCookie(req: Request, name: string): string | undefined {
  const header = req.headers.cookie;
  if (!header) return undefined;
  return parseCookie(header)[name];
}

export function hashSessionToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

type Db = PrismaService | Prisma.TransactionClient;

/** 세션 발급·조회·연장·폐기. 쿠키 yj_session ↔ sessions.token_hash */
@Injectable()
export class SessionService extends SessionResolver {
  constructor(
    private readonly prisma: PrismaService,
    private readonly web: WebConfig,
    private readonly config: AuthConfig,
  ) {
    super();
  }

  /** 새 세션을 만들고 쿠키를 심는다. 가입 트랜잭션 안에서 부르려면 db에 트랜잭션 클라이언트를 넘긴다 */
  async issue(res: Response, userId: string, db: Db = this.prisma) {
    const token = randomBytes(32).toString('base64url');
    const expiresAt = new Date(Date.now() + SESSION_TTL_MS);
    const session = await db.session.create({
      data: { userId, tokenHash: hashSessionToken(token), expiresAt },
      select: { id: true, expiresAt: true },
    });
    setCookie(res, this.web, SESSION_COOKIE, token, SESSION_TTL_MS);
    return session;
  }

  /** 이 요청의 세션을 폐기하고 쿠키를 지운다(로그아웃). 다른 기기 세션은 그대로 둔다 */
  async revokeCurrent(req: Request, res: Response) {
    const token = readCookie(req, SESSION_COOKIE);
    if (token && SESSION_TOKEN.test(token)) {
      await this.prisma.session.updateMany({
        where: { tokenHash: hashSessionToken(token), revokedAt: null },
        data: { revokedAt: new Date() },
      });
    }
    clearCookie(res, this.web, SESSION_COOKIE);
  }

  /** 가입 대기 쿠키의 SignupTicket id(서명·만료가 맞을 때만) */
  signupTicketId(req: Request): string | null {
    const id = this.config.signer.verify<unknown>(
      SIGNUP_PURPOSE,
      readCookie(req, SIGNUP_COOKIE),
    );
    return typeof id === 'string' && UUID.test(id) ? id : null;
  }

  async resolve(req: Request, res: Response): Promise<SessionState> {
    const token = readCookie(req, SESSION_COOKIE);
    if (token !== undefined) {
      const state = await this.resolveSession(token, res);
      if (state) return state;
      // 만료·폐기·위조된 쿠키는 지운다
      clearCookie(res, this.web, SESSION_COOKIE);
    }
    if (this.signupTicketId(req)) return { status: 'SIGNUP_REQUIRED' };
    return { status: 'ANONYMOUS' };
  }

  private async resolveSession(
    token: string,
    res: Response,
  ): Promise<SessionState | null> {
    if (!SESSION_TOKEN.test(token)) return null;
    const session = await this.prisma.session.findUnique({
      where: { tokenHash: hashSessionToken(token) },
      include: {
        user: { select: { id: true, nickname: true, profileImageUrl: true } },
      },
    });
    const now = Date.now();
    if (!session || session.revokedAt || session.expiresAt.getTime() <= now) {
      return null;
    }

    let expiresAt = session.expiresAt;
    if (expiresAt.getTime() - now < SESSION_REFRESH_BEFORE_MS) {
      expiresAt = new Date(now + SESSION_TTL_MS);
      await this.touch(session.id, { expiresAt, lastSeenAt: new Date(now) });
      setCookie(res, this.web, SESSION_COOKIE, token, SESSION_TTL_MS);
    } else if (now - session.lastSeenAt.getTime() > LAST_SEEN_INTERVAL_MS) {
      await this.touch(session.id, { lastSeenAt: new Date(now) });
    }
    return {
      status: 'AUTHENTICATED',
      user: session.user,
      session: { id: session.id, expiresAt },
    };
  }

  private touch(id: string, data: { expiresAt?: Date; lastSeenAt: Date }) {
    // 같은 순간 로그아웃됐을 수 있어 폐기되지 않은 행만 고친다
    return this.prisma.session.updateMany({
      where: { id, revokedAt: null },
      data,
    });
  }
}
