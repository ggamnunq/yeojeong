import { randomBytes } from 'node:crypto';
import { Injectable } from '@nestjs/common';
import type { CookieOptions, Request, Response } from 'express';
import { AuthConfig, readCookie } from '../common/auth/index.js';
import { AdminConfig } from './admin-config.js';
import { ADMIN_DEVICE_COOKIE, ADMIN_DEVICE_TTL_MS } from './admin.constants.js';

const DEVICE_ID = /^[A-Za-z0-9_-]{22}$/;

const COOKIE_OPTIONS: CookieOptions = {
  httpOnly: true,
  secure: true,
  sameSite: 'strict',
  path: '/',
};

/**
 * 관리자 장치 쿠키(OWASP "device cookie"). 로그인(비밀번호 + TOTP)에 성공한 브라우저에 90일짜리 서명 쿠키
 * __Host-yj_admin_dev를 준다. 이 쿠키가 유효한 로그인 요청은 전체 잠금(분산 대입 방어)에서 빠지고 그 장치만 따로 센다 —
 * 공격자가 전체 잠금을 계속 걸어 운영자를 무기한 막지 못하게.
 * 값 = 무작위 장치 ID를 서버 HMAC(SESSION_SECRET HKDF, ValueSigner)으로 서명. 서명 용도에 자격 증명 지문을 넣어
 * 아이디·비밀번호 해시·TOTP 시크릿을 바꾸면 모든 장치 쿠키가 무효가 된다. 인증 수단이 아니다(로그인은 여전히 비밀번호 + TOTP)
 */
@Injectable()
export class AdminDeviceService {
  constructor(
    private readonly auth: AuthConfig,
    private readonly admin: AdminConfig,
  ) {}

  /** 유효한 장치 쿠키의 장치 ID, 없거나 위조·만료·자격 증명 교체면 null */
  read(req: Request): string | null {
    const purpose = this.purpose();
    if (!purpose) return null;
    const value = this.auth.signer.verify<unknown>(
      purpose,
      readCookie(req, ADMIN_DEVICE_COOKIE),
    );
    return typeof value === 'string' && DEVICE_ID.test(value) ? value : null;
  }

  /** 장치 쿠키를 새로 주거나(같은 장치 ID로) 90일 연장한다 */
  issue(res: Response, deviceId: string | null) {
    const purpose = this.purpose();
    if (!purpose) return;
    const id = deviceId ?? randomBytes(16).toString('base64url');
    const token = this.auth.signer.sign(
      purpose,
      id,
      ADMIN_DEVICE_TTL_MS / 1000,
    );
    res.cookie(ADMIN_DEVICE_COOKIE, token, {
      ...COOKIE_OPTIONS,
      maxAge: ADMIN_DEVICE_TTL_MS,
    });
  }

  private purpose(): string | null {
    return this.admin.credentialTag
      ? `admin-device:v1:${this.admin.credentialTag}`
      : null;
  }
}
