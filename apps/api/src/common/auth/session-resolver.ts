import { createHash } from 'node:crypto';
import { Injectable } from '@nestjs/common';
import { parse as parseCookie } from 'cookie';
import type { Request, Response } from 'express';
import { PrismaService } from '../../prisma/prisma.service.js';
import type { AuthSession, AuthUser } from './auth-context.js';
import { SESSION_COOKIE, SIGNUP_COOKIE } from './auth.constants.js';

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

export function readCookie(req: Request, name: string): string | undefined {
  const header = req.headers.cookie;
  if (!header) return undefined;
  return parseCookie(header)[name];
}

export function hashSessionToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

/** 쿠키 yj_session → sessions 테이블(토큰 해시) 조회 */
@Injectable()
export class CookieSessionResolver extends SessionResolver {
  constructor(private readonly prisma: PrismaService) {
    super();
  }

  async resolve(req: Request): Promise<SessionState> {
    const token = readCookie(req, SESSION_COOKIE);
    if (token && SESSION_TOKEN.test(token)) {
      const session = await this.prisma.session.findUnique({
        where: { tokenHash: hashSessionToken(token) },
        include: {
          user: { select: { id: true, nickname: true, profileImageUrl: true } },
        },
      });
      if (session && !session.revokedAt && session.expiresAt > new Date()) {
        return {
          status: 'AUTHENTICATED',
          user: session.user,
          session: { id: session.id, expiresAt: session.expiresAt },
        };
      }
    }
    // TODO(2단계): 가입 대기 쿠키 서명 검증, 세션 연장(7일 미만 → 30일)·lastSeenAt 갱신
    if (readCookie(req, SIGNUP_COOKIE)) return { status: 'SIGNUP_REQUIRED' };
    return { status: 'ANONYMOUS' };
  }
}
