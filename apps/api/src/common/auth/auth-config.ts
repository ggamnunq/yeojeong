import { createHmac, hkdfSync } from 'node:crypto';
import { ConfigService } from '@nestjs/config';
import { ValueSigner } from '../crypto/signed-value.js';
import { TokenCipher } from '../crypto/token-cipher.js';

const MIN_SECRET_LENGTH = 32;
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/**
 * 인증·암호화 설정. 시작할 때 한 번 검증하고 값이 없거나 틀리면 부팅을 멈춘다.
 * 테스트 기본값은 vitest.config*.ts의 env에 있다. 값은 로그에 남기지 않는다.
 */
export class AuthConfig {
  readonly kakao: {
    /** REST API 키 */
    clientId: string;
    clientSecret: string;
    redirectUri: string;
  };
  /** 쿠키 서명(OAuth state, 가입 대기). 바꾸면 진행 중인 로그인·가입만 다시 하면 된다 */
  readonly signer: ValueSigner;
  /** *_enc 컬럼 암호화 */
  readonly tokenCipher: TokenCipher;
  /** 탈퇴·삭제 요청 코드 메일의 받는 주소(FR-108) */
  readonly supportEmail: string;
  private readonly userRefKey: string;
  private readonly deletionCodeKey: Buffer;

  constructor(config: ConfigService) {
    const required = (name: string) => {
      const value = config.get<string>(name);
      if (!value)
        throw new Error(`${name}이(가) 필요합니다 (.env.example 참고)`);
      return value;
    };
    const secret = (name: string) => {
      const value = required(name);
      if (value.length < MIN_SECRET_LENGTH) {
        throw new Error(
          `${name}은(는) ${MIN_SECRET_LENGTH}자 이상이어야 합니다`,
        );
      }
      return value;
    };

    const redirectUri = required('KAKAO_REDIRECT_URI');
    let parsed: URL;
    try {
      parsed = new URL(redirectUri);
    } catch {
      throw new Error('KAKAO_REDIRECT_URI 형식이 잘못됐습니다');
    }
    const production = config.get<string>('NODE_ENV') === 'production';
    if (
      parsed.protocol !== 'https:' &&
      (production || parsed.protocol !== 'http:')
    ) {
      throw new Error(
        'KAKAO_REDIRECT_URI는 https여야 합니다(로컬만 http 허용)',
      );
    }
    this.kakao = {
      clientId: required('KAKAO_CLIENT_ID'),
      clientSecret: required('KAKAO_CLIENT_SECRET'),
      redirectUri,
    };

    this.signer = new ValueSigner(secret('SESSION_SECRET'));

    const key = Buffer.from(required('TOKEN_ENCRYPTION_KEY'), 'base64');
    if (key.length !== 32) {
      throw new Error(
        'TOKEN_ENCRYPTION_KEY는 32바이트를 base64로 인코딩한 값이어야 합니다 (openssl rand -base64 32)',
      );
    }
    this.tokenCipher = new TokenCipher(key);

    // 교체 금지: 탈퇴 후에도 동의 기록·처리 기록을 같은 사용자로 묶는 데 쓴다
    this.userRefKey = secret('USER_REF_HMAC_KEY');
    this.deletionCodeKey = Buffer.from(
      hkdfSync('sha256', this.userRefKey, '', 'yeojeong:deletion-code:v1', 32),
    );

    const supportEmail = required('SUPPORT_EMAIL');
    if (!EMAIL.test(supportEmail)) {
      throw new Error('SUPPORT_EMAIL 형식이 잘못됐습니다');
    }
    this.supportEmail = supportEmail;
  }

  /** UserConsent·AccountDeletion.userRefHash = HMAC-SHA256(userId, USER_REF_HMAC_KEY) */
  userRefHash(userId: string): string {
    return createHmac('sha256', this.userRefKey).update(userId).digest('hex');
  }

  /** 탈퇴·삭제 요청 코드는 원문 대신 이 값만 저장한다 */
  deletionCodeHash(code: string): string {
    return createHmac('sha256', this.deletionCodeKey)
      .update(code)
      .digest('hex');
  }
}
