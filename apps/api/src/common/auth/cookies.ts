import type { CookieOptions, Response } from 'express';
import {
  LOGIN_STATE_COOKIE,
  SESSION_COOKIE,
  SIGNUP_COOKIE,
} from './auth.constants.js';
import type { WebConfig } from './web-config.js';

const DAY_MS = 86_400_000;
export const SESSION_TTL_MS = 30 * DAY_MS;
/** 남은 기간이 이보다 짧으면 사용할 때 30일로 연장한다 */
export const SESSION_REFRESH_BEFORE_MS = 7 * DAY_MS;
export const SIGNUP_TTL_SECONDS = 30 * 60;
export const LOGIN_STATE_TTL_SECONDS = 10 * 60;

// 쿠키별 경로: 세션은 화면 전체, 가입 대기는 /api, OAuth state는 카카오 로그인 경로에만 보낸다
const PATHS = {
  [SESSION_COOKIE]: '/',
  [SIGNUP_COOKIE]: '/api',
  [LOGIN_STATE_COOKIE]: '/api/auth/kakao',
} as const;

type CookieName = keyof typeof PATHS;

function options(web: WebConfig, name: CookieName): CookieOptions {
  return {
    httpOnly: true,
    secure: web.secureCookies,
    // 카카오에서 돌아오는 최상위 GET 이동에도 쿠키가 실려야 해서 Strict가 아니라 Lax다
    sameSite: 'lax',
    path: PATHS[name],
  };
}

export function setCookie(
  res: Response,
  web: WebConfig,
  name: CookieName,
  value: string,
  maxAgeMs: number,
) {
  res.cookie(name, value, { ...options(web, name), maxAge: maxAgeMs });
}

export function clearCookie(res: Response, web: WebConfig, name: CookieName) {
  res.clearCookie(name, options(web, name));
}
