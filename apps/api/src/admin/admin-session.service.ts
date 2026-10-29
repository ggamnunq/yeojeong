import { createHash, randomBytes } from 'node:crypto';
import { Injectable } from '@nestjs/common';
import type { AdminSessionView } from '@yeojeong/shared';
import type { CookieOptions, Request, Response } from 'express';
import { readCookie } from '../common/auth/index.js';
import { toKstIso } from '../expenses/kst.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { AdminConfig } from './admin-config.js';
import {
  ADMIN_ABSOLUTE_MS,
  ADMIN_COOKIE,
  ADMIN_IDLE_MS,
  ADMIN_TOUCH_INTERVAL_MS,
} from './admin.constants.js';

const TOKEN = /^[A-Za-z0-9_-]{43}$/;

const sha256Hex = (value: string) =>
  createHash('sha256').update(value).digest('hex');

/** 요청에 붙는 관리자 세션(AdminSessionGuard가 채운다) */
export interface AdminContext {
  sessionId: string;
  expiresAt: Date;
  idleExpiresAt: Date;
}

declare module 'http' {
  interface IncomingMessage {
    admin?: AdminContext;
  }
}

// 로컬 http://localhost에서도 브라우저가 Secure 쿠키를 받는다(localhost는 보안 컨텍스트). __Host-라 Secure를 끌 수 없다
const COOKIE_OPTIONS: CookieOptions = {
  httpOnly: true,
  secure: true,
  sameSite: 'strict',
  path: '/',
};

export function adminSessionView(ctx: AdminContext): AdminSessionView {
  return {
    authenticated: true,
    expiresAt: toKstIso(ctx.expiresAt),
    idleExpiresAt: toKstIso(ctx.idleExpiresAt),
  };
}

/**
 * 관리자 세션 발급·확인·폐기(admin_sessions). DB 기준이라 Cloud Run 인스턴스가 여럿이어도 같고, 로그아웃은 서버에서 바로 무효가 된다.
 * 유휴 30분(lastSeenAt) · 절대 8시간(expiresAt) · 자격 증명 지문(credentialTag)이 모두 맞아야 유효하다.
 */
@Injectable()
export class AdminSessionService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly admin: AdminConfig,
  ) {}

  async issue(res: Response, now = new Date()): Promise<AdminContext> {
    if (!this.admin.credentialTag) throw new Error('관리자 기능이 꺼져 있다');
    const token = randomBytes(32).toString('base64url');
    const expiresAt = new Date(now.getTime() + ADMIN_ABSOLUTE_MS);
    const row = await this.prisma.adminSession.create({
      data: {
        tokenHash: sha256Hex(token),
        credentialTag: this.admin.credentialTag,
        lastSeenAt: now,
        expiresAt,
      },
      select: { id: true },
    });
    // 쿠키 수명 = 절대 만료. 유휴 만료는 서버가 판단한다
    res.cookie(ADMIN_COOKIE, token, {
      ...COOKIE_OPTIONS,
      maxAge: ADMIN_ABSOLUTE_MS,
    });
    return {
      sessionId: row.id,
      expiresAt,
      idleExpiresAt: idleUntil(now, expiresAt),
    };
  }

  /** 유효한 세션이면 마지막 사용 시각을 늦추고 돌려준다. 아니면 null(쿠키는 지운다) */
  async resolve(
    req: Request,
    res: Response,
    now = new Date(),
  ): Promise<AdminContext | null> {
    const token = readCookie(req, ADMIN_COOKIE);
    if (token === undefined) return null;
    const ctx = TOKEN.test(token) ? await this.lookup(token, now) : null;
    if (!ctx) this.clearCookie(res);
    return ctx;
  }

  /** 이 요청의 관리자 세션을 폐기한다(로그아웃·다시 로그인). res를 주면 쿠키도 지운다(다시 로그인은 새 쿠키로 덮는다) */
  async revokeCurrent(req: Request, res?: Response, now = new Date()) {
    const token = readCookie(req, ADMIN_COOKIE);
    if (token && TOKEN.test(token)) {
      await this.prisma.adminSession.updateMany({
        where: { tokenHash: sha256Hex(token), revokedAt: null },
        data: { revokedAt: now },
      });
    }
    if (res) this.clearCookie(res);
  }

  /** 아직 유효한 관리자 세션을 모두 폐기한다(새로 로그인하면 다른 브라우저의 세션은 끝난다) */
  async revokeAll(now = new Date()): Promise<number> {
    const { count } = await this.prisma.adminSession.updateMany({
      where: { revokedAt: null },
      data: { revokedAt: now },
    });
    return count;
  }

  clearCookie(res: Response) {
    res.clearCookie(ADMIN_COOKIE, COOKIE_OPTIONS);
  }

  private async lookup(token: string, now: Date): Promise<AdminContext | null> {
    const row = await this.prisma.adminSession.findUnique({
      where: { tokenHash: sha256Hex(token) },
      select: {
        id: true,
        credentialTag: true,
        lastSeenAt: true,
        expiresAt: true,
        revokedAt: true,
      },
    });
    const t = now.getTime();
    if (
      !row ||
      row.revokedAt !== null ||
      row.expiresAt.getTime() <= t ||
      row.lastSeenAt.getTime() + ADMIN_IDLE_MS <= t ||
      row.credentialTag !== this.admin.credentialTag
    ) {
      return null;
    }
    let lastSeenAt = row.lastSeenAt;
    if (t - lastSeenAt.getTime() >= ADMIN_TOUCH_INTERVAL_MS) {
      // 같은 순간 로그아웃됐을 수 있어 폐기되지 않은 행만
      const touched = await this.prisma.adminSession.updateMany({
        where: { id: row.id, revokedAt: null },
        data: { lastSeenAt: now },
      });
      if (touched.count === 0) return null;
      lastSeenAt = now;
    }
    return {
      sessionId: row.id,
      expiresAt: row.expiresAt,
      idleExpiresAt: idleUntil(lastSeenAt, row.expiresAt),
    };
  }
}

function idleUntil(lastSeenAt: Date, expiresAt: Date): Date {
  return new Date(
    Math.min(lastSeenAt.getTime() + ADMIN_IDLE_MS, expiresAt.getTime()),
  );
}
