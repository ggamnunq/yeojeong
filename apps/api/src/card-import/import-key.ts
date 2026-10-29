import { createHmac } from 'node:crypto';
import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

const MIN_KEY_LENGTH = 32;
/** 로컬·테스트 고정 개발 키(비밀 아님). 운영(NODE_ENV=production)에서는 쓰지 않는다 */
const DEV_KEY = 'yeojeong-local-dev-import-key-hmac (not a secret)';

/**
 * importKey 전용 HMAC 키(env IMPORT_KEY_HMAC_KEY, Secret Manager yeojeong-import-key-hmac-key — Terraform random_password).
 * importKey = HMAC-SHA256(이 키, "card-import:v1|사용자|기관|승인번호|승인일시|원 승인금액|통화") hex 64자.
 * 키 없이 승인번호를 되살릴 수 없다. **교체 금지**: 저장된 importKey와 다시 불러온 결과의 "추가됨" 판정이 끊긴다.
 * 다른 키(TOKEN_ENCRYPTION_KEY 등)와 분리해 그 키를 교체해도 판정이 유지된다.
 * 운영에서 키가 없으면 부팅은 막지 않고(기능 플래그가 꺼진다 — FeatureFlags) 쓰려 할 때 실패한다.
 */
@Injectable()
export class ImportKeyHasher {
  private readonly key: string | null;

  constructor(config: ConfigService) {
    const raw = config.get<string>('IMPORT_KEY_HMAC_KEY')?.trim() || null;
    if (raw && raw.length < MIN_KEY_LENGTH) {
      throw new Error(
        `IMPORT_KEY_HMAC_KEY는 ${MIN_KEY_LENGTH}자 이상이어야 합니다`,
      );
    }
    this.key =
      raw ?? (config.get<string>('NODE_ENV') === 'production' ? null : DEV_KEY);
  }

  hash(material: string): string {
    if (!this.key)
      throw new Error('운영에서는 IMPORT_KEY_HMAC_KEY가 필요합니다');
    return createHmac('sha256', this.key).update(material).digest('hex');
  }
}
