import { createHash, hkdfSync } from 'node:crypto';
import type { ConfigService } from '@nestjs/config';
import { TokenCipher as AesGcm } from '../common/crypto/token-cipher.js';
import { parseEncryptionKey } from '../payment-methods/token-cipher.js';

/** 로컬·테스트 기본 키 재료(payment-methods TokenCipher와 같은 방식). 운영(NODE_ENV=production)에서는 쓰지 않는다 */
const DEV_KEY_SEED = 'yeojeong-local-dev-card-import-key (not a secret)';

/**
 * TOKEN_ENCRYPTION_KEY에서 용도별로 HKDF 파생한 AES-256-GCM 암호기(S8). 용도(info)가 다르면 키가 달라 서로의 암호문을 풀 수 없다.
 * 운영에서 키가 없으면 null(쓰려고 할 때 실패한다 — 부팅은 막지 않는다)
 */
export function cardImportCipher(
  config: ConfigService,
  info: 'card-import:two-way:v1' | 'card-import:pending-deletion:v1',
): AesGcm | null {
  const raw = config.get<string>('TOKEN_ENCRYPTION_KEY');
  let base: Buffer | null = null;
  if (raw) base = parseEncryptionKey(raw);
  else if (config.get<string>('NODE_ENV') !== 'production') {
    base = createHash('sha256').update(DEV_KEY_SEED).digest();
  }
  return base
    ? new AesGcm(
        Buffer.from(hkdfSync('sha256', base, Buffer.alloc(0), info, 32)),
      )
    : null;
}

export function requireCipher(cipher: AesGcm | null): AesGcm {
  if (!cipher) throw new Error('운영에서는 TOKEN_ENCRYPTION_KEY가 필요합니다');
  return cipher;
}
