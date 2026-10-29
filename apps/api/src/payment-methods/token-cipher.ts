import {
  createCipheriv,
  createDecipheriv,
  createHash,
  createHmac,
  hkdfSync,
  randomBytes,
} from 'node:crypto';
import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

// 토큰·원문 페이로드 암호화(AES-256-GCM). 키는 env TOKEN_ENCRYPTION_KEY(32바이트, base64 또는 hex).
// S1이 src/common/crypto를 만들면 그쪽으로 합친다(나중에 Cloud KMS 봉투 암호화로 교체).
//
// 저장 형식: [버전 1바이트 = 0x01][IV 12바이트][인증 태그 16바이트][암호문]
// AAD(추가 인증 데이터)에 용도를 넣어, 한 컬럼의 암호문을 다른 컬럼에 옮겨 넣으면 복호화가 실패한다.

const VERSION = 0x01;
const IV_BYTES = 12;
const TAG_BYTES = 16;
/** 로컬·테스트 기본 키를 만드는 문자열. 운영(NODE_ENV=production)에서는 쓰지 않고 부팅을 멈춘다 */
const DEV_KEY_SEED = 'yeojeong-local-dev-token-key (not a secret)';

/** 암호문 컬럼별 AAD. 값을 바꾸면 기존 암호문을 못 읽으니 바꾸지 않는다 */
export const CipherPurpose = {
  ACCESS_TOKEN: 'payment_connections.access_token',
  REFRESH_TOKEN: 'payment_connections.refresh_token',
  RAW_PAYLOAD: 'transactions.raw_payload',
} as const;
export type CipherPurpose = (typeof CipherPurpose)[keyof typeof CipherPurpose];

export function parseEncryptionKey(raw: string): Buffer {
  const value = raw.trim();
  const key = /^[0-9a-f]{64}$/i.test(value)
    ? Buffer.from(value, 'hex')
    : Buffer.from(value, 'base64');
  if (key.length !== 32) {
    throw new Error(
      'TOKEN_ENCRYPTION_KEY는 32바이트(base64 44자 또는 hex 64자)여야 합니다',
    );
  }
  return key;
}

@Injectable()
export class TokenCipher {
  private readonly keys: { key: Buffer; refKey: Buffer } | null;

  /**
   * 운영(NODE_ENV=production)에서 키가 없으면 부팅은 막지 않고 암호화·복호화를 부를 때 실패한다
   * (Secret Manager에 키를 넣기 전에 배포돼도 결제수단과 무관한 API는 돌게). 로컬·테스트는 고정 개발 키.
   */
  constructor(config: ConfigService) {
    const raw = config.get<string>('TOKEN_ENCRYPTION_KEY');
    let key: Buffer | null = null;
    if (raw) {
      key = parseEncryptionKey(raw);
    } else if (config.get<string>('NODE_ENV') !== 'production') {
      key = createHash('sha256').update(DEV_KEY_SEED).digest();
    }
    // 외부 참조 HMAC 키는 같은 비밀에서 용도를 나눠 파생한다
    this.keys = key
      ? {
          key,
          refKey: Buffer.from(
            hkdfSync('sha256', key, Buffer.alloc(0), 'external-ref', 32),
          ),
        }
      : null;
  }

  private get key(): Buffer {
    if (!this.keys)
      throw new Error('운영에서는 TOKEN_ENCRYPTION_KEY가 필요합니다');
    return this.keys.key;
  }

  private get refKey(): Buffer {
    if (!this.keys)
      throw new Error('운영에서는 TOKEN_ENCRYPTION_KEY가 필요합니다');
    return this.keys.refKey;
  }

  /** 테스트용: 키를 직접 넣어 만든다 */
  static fromKey(key: string): TokenCipher {
    return new TokenCipher({
      get: (name: string) =>
        name === 'TOKEN_ENCRYPTION_KEY' ? key : undefined,
    } as ConfigService);
  }

  encrypt(plaintext: string, purpose: CipherPurpose): Uint8Array<ArrayBuffer> {
    const iv = randomBytes(IV_BYTES);
    const cipher = createCipheriv('aes-256-gcm', this.key, iv);
    cipher.setAAD(Buffer.from(purpose));
    const body = Buffer.concat([
      cipher.update(plaintext, 'utf8'),
      cipher.final(),
    ]);
    const out = Buffer.concat([
      Buffer.from([VERSION]),
      iv,
      cipher.getAuthTag(),
      body,
    ]);
    return new Uint8Array(out);
  }

  /** 키·AAD가 다르거나 변조됐으면 예외(메시지에 값 없음) */
  decrypt(data: Uint8Array, purpose: CipherPurpose): string {
    const buf = Buffer.from(data);
    if (buf.length < 1 + IV_BYTES + TAG_BYTES || buf[0] !== VERSION) {
      throw new Error('암호문 형식이 올바르지 않습니다');
    }
    const iv = buf.subarray(1, 1 + IV_BYTES);
    const tag = buf.subarray(1 + IV_BYTES, 1 + IV_BYTES + TAG_BYTES);
    const body = buf.subarray(1 + IV_BYTES + TAG_BYTES);
    const decipher = createDecipheriv('aes-256-gcm', this.key, iv);
    decipher.setAAD(Buffer.from(purpose));
    decipher.setAuthTag(tag);
    return Buffer.concat([decipher.update(body), decipher.final()]).toString(
      'utf8',
    );
  }

  encryptJson(value: unknown, purpose: CipherPurpose): Uint8Array<ArrayBuffer> {
    return this.encrypt(JSON.stringify(value ?? null), purpose);
  }

  decryptJson<T = unknown>(data: Uint8Array, purpose: CipherPurpose): T {
    return JSON.parse(this.decrypt(data, purpose)) as T;
  }

  /** 실번호 같은 식별자를 저장하지 않으려고 쓰는 HMAC-SHA256(hex 64자) */
  hmacRef(value: string): string {
    return createHmac('sha256', this.refKey).update(value).digest('hex');
  }
}
