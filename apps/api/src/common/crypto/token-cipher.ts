import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';

const VERSION = 1;
const IV_LENGTH = 12;
const TAG_LENGTH = 16;

/**
 * 금융기관 토큰·원문 페이로드를 DB(*_enc bytea)에 넣기 전에 AES-256-GCM으로 암호화한다.
 * 형식: [버전 1바이트][IV 12][태그 16][암호문]. 키는 env TOKEN_ENCRYPTION_KEY(32바이트 base64).
 * 나중에 Cloud KMS 봉투 암호화로 바꾸면 버전 바이트로 구분한다. 복호화한 값은 로그·응답에 넣지 않는다.
 */
export class TokenCipher {
  constructor(private readonly key: Buffer) {
    if (key.length !== 32) {
      throw new Error('TOKEN_ENCRYPTION_KEY는 32바이트여야 합니다');
    }
  }

  /** associatedData에 행 ID 등을 넣으면 다른 행으로 옮긴 암호문은 풀리지 않는다 */
  encrypt(plaintext: string | Buffer, associatedData?: string): Buffer {
    const iv = randomBytes(IV_LENGTH);
    const cipher = createCipheriv('aes-256-gcm', this.key, iv);
    if (associatedData) cipher.setAAD(Buffer.from(associatedData));
    const body = Buffer.concat([cipher.update(plaintext), cipher.final()]);
    return Buffer.concat([Buffer.of(VERSION), iv, cipher.getAuthTag(), body]);
  }

  decrypt(data: Uint8Array, associatedData?: string): Buffer {
    const buffer = Buffer.from(data);
    if (buffer.length < 1 + IV_LENGTH + TAG_LENGTH || buffer[0] !== VERSION) {
      throw new Error('지원하지 않는 암호문 형식입니다');
    }
    const iv = buffer.subarray(1, 1 + IV_LENGTH);
    const tag = buffer.subarray(1 + IV_LENGTH, 1 + IV_LENGTH + TAG_LENGTH);
    const decipher = createDecipheriv('aes-256-gcm', this.key, iv);
    if (associatedData) decipher.setAAD(Buffer.from(associatedData));
    decipher.setAuthTag(tag);
    return Buffer.concat([
      decipher.update(buffer.subarray(1 + IV_LENGTH + TAG_LENGTH)),
      decipher.final(),
    ]);
  }
}
