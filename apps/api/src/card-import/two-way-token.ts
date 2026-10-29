import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { AppException } from '../common/errors/index.js';
import { TokenCipher as AesGcm } from '../common/crypto/token-cipher.js';
import { cardImportCipher, requireCipher } from './keys.js';

/** CODEF가 추가 인증 응답(CF-03002)으로 준 이어서 보낼 값(add-auth 가이드: 그대로 twoWayInfo에 넣는다) */
export interface CodefTwoWayInfo {
  jobIndex: number;
  threadIndex: number;
  jti: string;
  twoWayTimestamp: number;
}

/** 토큰 안에 넣는 상태. 카드사 아이디·비밀번호는 넣지 않는다(화면이 다시 보낸다) — 아이디는 같은 사람인지 확인할 HMAC만 */
export interface TwoWayState {
  organization: string;
  from: string;
  to: string;
  /** hmacRef(loginId): 이어서 보낸 아이디가 처음과 같은지 */
  loginRef: string;
  info: CodefTwoWayInfo;
}

interface Sealed extends TwoWayState {
  /** 만료(epoch ms) */
  exp: number;
}

const PREFIX = 'tw1.';
const MAX_TOKEN_LENGTH = 2048;

const expired = () => AppException.of('CARD_TWO_WAY_EXPIRED');

/**
 * 추가 인증 이어가기 토큰(S8). 서버는 이 상태를 메모리·DB에 두지 않는다(Cloud Run 여러 인스턴스).
 * 키: TOKEN_ENCRYPTION_KEY에서 HKDF로 용도를 나눠 파생한 AES-256-GCM 키. AAD에 사용자 ID를 넣어 다른 사용자는 풀 수 없다.
 * 형식: "tw1." + base64url([버전][IV][태그][암호문]). 만료는 payload의 exp로 본다(풀지 못하거나 지났으면 410 CARD_TWO_WAY_EXPIRED)
 */
@Injectable()
export class TwoWayTokenSealer {
  private readonly cipher: AesGcm | null;

  constructor(config: ConfigService) {
    this.cipher = cardImportCipher(config, 'card-import:two-way:v1');
  }

  private get aes(): AesGcm {
    return requireCipher(this.cipher);
  }

  seal(userId: string, state: TwoWayState, expiresAt: Date): string {
    const sealed: Sealed = { ...state, exp: expiresAt.getTime() };
    const data = this.aes.encrypt(JSON.stringify(sealed), aad(userId));
    return PREFIX + data.toString('base64url');
  }

  /** 다른 사용자·변조·만료면 410 CARD_TWO_WAY_EXPIRED(어느 쪽인지 알려 주지 않는다) */
  open(userId: string, token: string, now = Date.now()): TwoWayState {
    if (!token.startsWith(PREFIX) || token.length > MAX_TOKEN_LENGTH)
      throw expired();
    let sealed: Sealed;
    try {
      const plain = this.aes.decrypt(
        Buffer.from(token.slice(PREFIX.length), 'base64url'),
        aad(userId),
      );
      sealed = JSON.parse(plain.toString('utf8')) as Sealed;
    } catch {
      throw expired();
    }
    if (typeof sealed.exp !== 'number' || sealed.exp <= now) throw expired();
    const { exp: _exp, ...state } = sealed;
    return state;
  }
}

const aad = (userId: string) => `card-import.two-way:${userId}`;
