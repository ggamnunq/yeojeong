import { Injectable } from '@nestjs/common';
import { AuthConfig } from '../../common/auth/auth-config.js';

/** 카카오 사용자 정보 중 서비스가 쓰는 것만. 액세스 토큰은 저장하지 않는다(기능명세 7-1) */
export interface KakaoProfile {
  /** 카카오 회원번호(숫자를 문자열로). 로그에 남기지 않는다 */
  id: string;
  nickname: string | null;
  /** 프사가 없거나 카카오 기본 이미지면 null */
  profileImageUrl: string | null;
}

/** 카카오 HTTP 호출 경계. 테스트는 가짜 구현으로 바꿔 끼운다 */
export abstract class KakaoClient {
  abstract authorizeUrl(state: string): string;
  /** 인가 코드 → 사용자 정보. 실패하면 KakaoError */
  abstract fetchProfile(code: string): Promise<KakaoProfile>;
}

export class KakaoError extends Error {
  constructor(
    readonly stage: 'token' | 'profile',
    readonly status?: number,
    /** 카카오가 준 오류 코드(예: KOE320). 개인정보 없음 */
    readonly kakaoCode?: string,
  ) {
    super(`카카오 ${stage} 요청 실패`);
  }
}

const AUTHORIZE_URL = 'https://kauth.kakao.com/oauth/authorize';
const TOKEN_URL = 'https://kauth.kakao.com/oauth/token';
const PROFILE_URL = 'https://kapi.kakao.com/v2/user/me';
// 동의 항목: 닉네임(필수)·프로필 사진(선택)만. 이메일 등은 요청하지 않는다
const SCOPE = 'profile_nickname,profile_image';
const TIMEOUT_MS = 5000;
const MAX_URL_LENGTH = 2048;

interface TokenResponse {
  access_token?: string;
}

interface ProfileResponse {
  id?: number | string;
  kakao_account?: {
    profile?: {
      nickname?: string;
      profile_image_url?: string;
      is_default_image?: boolean;
    };
  };
}

/** 프사 URL 정리: 기본 이미지·빈 값은 null, http는 https로, 그 밖의 형식은 버린다 */
export function normalizeProfileImage(
  url: string | undefined,
  isDefault: boolean | undefined,
): string | null {
  if (!url || isDefault) return null;
  try {
    const parsed = new URL(url.replace(/^http:\/\//i, 'https://'));
    if (parsed.protocol !== 'https:') return null;
    const value = parsed.toString();
    return value.length <= MAX_URL_LENGTH ? value : null;
  } catch {
    return null;
  }
}

/**
 * REST API 키 + client secret, 인가 코드 방식. state는 서명 쿠키로 검증한다.
 * PKCE는 카카오 문서에 없는 파라미터라 쓰지 않는다(2026-10-28 확인).
 */
@Injectable()
export class HttpKakaoClient extends KakaoClient {
  constructor(private readonly config: AuthConfig) {
    super();
  }

  authorizeUrl(state: string): string {
    const url = new URL(AUTHORIZE_URL);
    url.search = new URLSearchParams({
      response_type: 'code',
      client_id: this.config.kakao.clientId,
      redirect_uri: this.config.kakao.redirectUri,
      scope: SCOPE,
      state,
    }).toString();
    return url.toString();
  }

  async fetchProfile(code: string): Promise<KakaoProfile> {
    const token = await this.request<TokenResponse>('token', TOKEN_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded;charset=utf-8',
      },
      body: new URLSearchParams({
        grant_type: 'authorization_code',
        client_id: this.config.kakao.clientId,
        client_secret: this.config.kakao.clientSecret,
        redirect_uri: this.config.kakao.redirectUri,
        code,
      }),
    });
    if (!token.access_token) throw new KakaoError('token');

    const profile = await this.request<ProfileResponse>(
      'profile',
      `${PROFILE_URL}?secure_resource=true`,
      { headers: { Authorization: `Bearer ${token.access_token}` } },
    );
    if (profile.id === undefined || profile.id === null) {
      throw new KakaoError('profile');
    }
    const kakaoProfile = profile.kakao_account?.profile;
    return {
      id: String(profile.id),
      nickname: kakaoProfile?.nickname?.trim() || null,
      profileImageUrl: normalizeProfileImage(
        kakaoProfile?.profile_image_url,
        kakaoProfile?.is_default_image,
      ),
    };
  }

  private async request<T>(
    stage: 'token' | 'profile',
    url: string,
    init: RequestInit,
  ): Promise<T> {
    let response: Response;
    try {
      response = await fetch(url, {
        ...init,
        signal: AbortSignal.timeout(TIMEOUT_MS),
      });
    } catch {
      throw new KakaoError(stage);
    }
    const body = (await response.json().catch(() => ({}))) as T & {
      error_code?: string;
    };
    if (!response.ok) {
      throw new KakaoError(stage, response.status, body.error_code);
    }
    return body;
  }
}
