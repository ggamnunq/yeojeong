import { createHmac, timingSafeEqual } from 'node:crypto';
import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { CARD_IMPORT_RESULT_TTL_SECONDS } from '@yeojeong/shared';
import { cardImportKey } from './keys.js';

/** 서명하는 값: 저장(import) 때 클라이언트가 다시 보내는 것 그대로 */
export interface SignedItem {
  importKey: string;
  occurredAt: string;
  amount: string;
  currency: string;
  merchantName: string;
  krwAmount: number | null;
}

const TOKEN = /^(\d{10})\.([A-Za-z0-9_-]{43})$/;

/**
 * 조회 결과 항목 서명(itemToken, S8). 서버는 조회 결과를 저장하지 않으므로, 저장(import) 때 클라이언트가 보낸 항목이
 * 정말 이 사용자에게 서버가 돌려준 값 그대로인지를 이 서명으로만 확인한다(무상태). 값을 바꾸거나 만들어 넣으면 맞지 않는다.
 * 형식: "<만료 epoch 초>.<HMAC-SHA256 base64url>". 키는 TOKEN_ENCRYPTION_KEY에서 HKDF로 용도를 나눠 파생한다.
 * 서명 재료에 사용자 ID·만료를 넣어 다른 사용자·오래된 결과로 옮겨 쓸 수 없다. 수명 = CARD_IMPORT_RESULT_TTL_SECONDS(30분)
 */
@Injectable()
export class ItemTokenSigner {
  private readonly key: Buffer | null;

  constructor(config: ConfigService) {
    this.key = cardImportKey(config, 'card-import:item-token:v1');
  }

  sign(userId: string, item: SignedItem, now = Date.now()): string {
    const exp = Math.floor(now / 1000) + CARD_IMPORT_RESULT_TTL_SECONDS;
    return `${exp}.${this.mac(userId, item, exp)}`;
  }

  /** 서명·만료가 맞으면 true. 형식 오류·다른 값·지난 토큰은 false */
  verify(
    userId: string,
    item: SignedItem,
    token: string,
    now = Date.now(),
  ): boolean {
    const match = TOKEN.exec(token);
    if (!match) return false;
    const exp = Number(match[1]);
    if (exp * 1000 <= now) return false;
    const expected = Buffer.from(this.mac(userId, item, exp));
    const given = Buffer.from(match[2]);
    return expected.length === given.length && timingSafeEqual(expected, given);
  }

  private mac(userId: string, item: SignedItem, exp: number): string {
    if (!this.key)
      throw new Error('운영에서는 TOKEN_ENCRYPTION_KEY가 필요합니다');
    // 순서가 고정된 JSON 배열(구분자 충돌 없음)
    const material = JSON.stringify([
      'card-import-item:v1',
      userId,
      item.importKey,
      item.occurredAt,
      item.amount,
      item.currency,
      item.merchantName,
      item.krwAmount,
      exp,
    ]);
    return createHmac('sha256', this.key).update(material).digest('base64url');
  }
}
