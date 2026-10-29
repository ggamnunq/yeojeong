import { createHash, createPublicKey } from 'node:crypto';
import { Injectable, Logger } from '@nestjs/common';
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
  /** RSA 모듈러스 바이트 수(2048비트 = 256). 암호문 길이 검사 기준. 키가 없으면 null */
  readonly modulusBytes: number | null;

  constructor(config: ConfigService) {
    this.env = pick(
      'CODEF_ENV',
      config.get<string>('CODEF_ENV'),
      CODEF_ENV_VALUES,
      'sandbox',
    );
    const mode = pick(
      'CODEF_LOGIN_MODE',
      config.get<string>('CODEF_LOGIN_MODE'),
      CODEF_LOGIN_MODE_VALUES,
      'direct',
    );
    // 운영에서 account 모드(CODEF 계정 생성)는 CODEF_ALLOW_ACCOUNT_MODE=true로 따로 허락해야 한다. 아니면 direct로 둔다
    const allowAccount =
      config.get<string>('CODEF_ALLOW_ACCOUNT_MODE')?.trim().toLowerCase() ===
      'true';
    if (
      mode === 'account' &&
      config.get<string>('NODE_ENV') === 'production' &&
      !allowAccount
    ) {
      new Logger(CodefConfig.name).error(
        'CODEF_LOGIN_MODE=account는 운영에서 CODEF_ALLOW_ACCOUNT_MODE=true가 있어야 한다 — direct로 동작',
      );
      this.loginMode = 'direct';
    } else {
      this.loginMode = mode;
    }
    this.clientId = config.get<string>('CODEF_CLIENT_ID')?.trim() ?? '';
    this.clientSecret = config.get<string>('CODEF_CLIENT_SECRET')?.trim() ?? '';
    this.publicKey = normalizePublicKey(
      config.get<string>('CODEF_PUBLIC_KEY') ?? '',
    );
    this.modulusBytes = rsaModulusBytes(this.publicKey);
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

/** base64 SPKI → RSA 모듈러스 바이트 수. 키가 없으면 null, RSA 키가 아니거나 읽을 수 없으면 부팅을 멈춘다 */
function rsaModulusBytes(publicKey: string): number | null {
  if (!publicKey) return null;
  let bits: number | undefined;
  try {
    const key = createPublicKey({
      key: Buffer.from(publicKey, 'base64'),
      format: 'der',
      type: 'spki',
    });
    bits =
      key.asymmetricKeyType === 'rsa'
        ? key.asymmetricKeyDetails?.modulusLength
        : undefined;
  } catch {
    bits = undefined;
  }
  if (!bits) throw new Error('CODEF_PUBLIC_KEY는 RSA 공개키(SPKI)여야 합니다');
  return Math.ceil(bits / 8);
}
