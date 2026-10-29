import { createHash, hkdfSync } from 'node:crypto';
import type { ConfigService } from '@nestjs/config';
import { TokenCipher as AesGcm } from '../common/crypto/token-cipher.js';
import { parseEncryptionKey } from '../payment-methods/token-cipher.js';

/** 로컬·테스트 기본 키 재료(payment-methods TokenCipher와 같은 방식). 운영(NODE_ENV=production)에서는 쓰지 않는다 */
const DEV_KEY_SEED = 'yeojeong-local-dev-card-import-key (not a secret)';

/** S8에서 TOKEN_ENCRYPTION_KEY로부터 파생하는 키의 용도. 용도가 다르면 키가 달라 서로의 값을 풀거나 위조할 수 없다 */
export type CardImportKeyPurpose =
  | 'card-import:two-way:v1'
  | 'card-import:pending-deletion:v1'
  | 'card-import:item-token:v1';

/** TOKEN_ENCRYPTION_KEY에서 HKDF-SHA256으로 용도별 32바이트 키를 만든다. 운영에서 키가 없으면 null(쓰려 할 때 실패 — 부팅은 막지 않는다) */
export function cardImportKey(
  config: ConfigService,
  purpose: CardImportKeyPurpose,
): Buffer | null {
  const raw = config.get<string>('TOKEN_ENCRYPTION_KEY');
  let base: Buffer | null = null;
  if (raw) base = parseEncryptionKey(raw);
  else if (config.get<string>('NODE_ENV') !== 'production') {
    base = createHash('sha256').update(DEV_KEY_SEED).digest();
  }
  return base
    ? Buffer.from(hkdfSync('sha256', base, Buffer.alloc(0), purpose, 32))
    : null;
}

/** 용도별 AES-256-GCM 암호기 */
export function cardImportCipher(
  config: ConfigService,
  purpose: CardImportKeyPurpose,
): AesGcm | null {
  const key = cardImportKey(config, purpose);
  return key ? new AesGcm(key) : null;
}

export function requireCipher(cipher: AesGcm | null): AesGcm {
  if (!cipher) throw new Error('운영에서는 TOKEN_ENCRYPTION_KEY가 필요합니다');
  return cipher;
}
