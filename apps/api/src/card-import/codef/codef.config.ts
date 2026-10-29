import { createHash } from 'node:crypto';
import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  CODEF_API_HOSTS,
  CODEF_ENV_VALUES,
  type CodefEnv,
} from './codef.constants.js';

export const CODEF_LOGIN_MODE_VALUES = ['direct', 'account'] as const;
/**
 * - direct(기본): 승인내역 요청에 아이디·암호화 비밀번호를 바로 넣는다(KR_CD_P_002 입력부: connectedId는 "로그인 파라미터를 생략할 때만 필수").
 *   CODEF에 계정(connectedId)을 만들지 않으므로 지울 것도 남는 것도 없다. 추가 인증도 상태 없이 이어진다.
 * - account: 계정 등록(account/create) → 조회 → finally 계정 삭제(account/delete). direct가 운영에서 막힐 때 쓰는 대안.
 *   connectedId는 그 요청 안의 지역 변수로만 쓰고 저장·기록하지 않는다. 추가 인증이 필요하면 계정을 지우고 CARD_TWO_WAY_UNSUPPORTED
 */
export type CodefLoginMode = (typeof CODEF_LOGIN_MODE_VALUES)[number];

function pick<T extends string>(
  name: string,
  raw: string | undefined,
  allowed: readonly T[],
  fallback: T,
): T {
  const value = raw?.trim().toLowerCase();
  if (!value) return fallback;
  if ((allowed as readonly string[]).includes(value)) return value as T;
  throw new Error(
    `${name}는 ${allowed.join('|')} 중 하나여야 합니다: ${value}`,
  );
}

/** 공개키: PEM이든 base64 한 줄이든 받아 base64 SPKI 한 줄로 맞춘다(화면에 그대로 내려준다) */
export function normalizePublicKey(raw: string): string {
  return raw
    .replace(/-----(BEGIN|END) PUBLIC KEY-----/g, '')
    .replace(/\s+/g, '');
}

/**
 * CODEF env. 값은 운영에서 Secret Manager(yeojeong-codef-*)로 들어온다(infra/envs/prod enable_codef).
 * 키가 하나라도 없으면 기능 플래그(FeatureFlags.cardImport)가 false가 되어 이 값을 쓰지 않는다.
 */
@Injectable()
export class CodefConfig {
  readonly env: CodefEnv;
  readonly loginMode: CodefLoginMode;
  readonly clientId: string;
  readonly clientSecret: string;
  readonly publicKey: string;
  /** 공개키(DER) SHA-256 hex. 화면 테스트가 고정값과 비교해 키가 바뀌었는지 안다. 키가 없으면 빈 문자열 */
  readonly publicKeyFingerprint: string;

  constructor(config: ConfigService) {
    this.env = pick(
      'CODEF_ENV',
      config.get<string>('CODEF_ENV'),
      CODEF_ENV_VALUES,
      'sandbox',
    );
    this.loginMode = pick(
      'CODEF_LOGIN_MODE',
      config.get<string>('CODEF_LOGIN_MODE'),
      CODEF_LOGIN_MODE_VALUES,
      'direct',
    );
    this.clientId = config.get<string>('CODEF_CLIENT_ID')?.trim() ?? '';
    this.clientSecret = config.get<string>('CODEF_CLIENT_SECRET')?.trim() ?? '';
    this.publicKey = normalizePublicKey(
      config.get<string>('CODEF_PUBLIC_KEY') ?? '',
    );
    this.publicKeyFingerprint = this.publicKey
      ? createHash('sha256')
          .update(Buffer.from(this.publicKey, 'base64'))
          .digest('hex')
      : '';
  }

  get apiHost(): string {
    return CODEF_API_HOSTS[this.env];
  }
}
