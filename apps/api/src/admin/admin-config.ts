import { createHash, timingSafeEqual } from 'node:crypto';
import { ConfigService } from '@nestjs/config';
import { AppException } from '../common/errors/index.js';
import {
  parseScryptHash,
  verifyPassword,
  type ScryptHash,
} from './password-hash.js';
import { TOTP_MIN_SECRET_BYTES, base32Decode, verifyTotp } from './totp.js';

const USERNAME = /^[A-Za-z0-9._@-]{3,64}$/;
/** 한 인스턴스에서 동시에 도는 scrypt 수(N = 2^17이면 하나에 약 128MiB — Cloud Run 512Mi) */
const SCRYPT_CONCURRENCY = 1;
/** scrypt 대기열 상한. 넘으면 429 RATE_LIMITED(메모리·CPU를 지킨다) */
const SCRYPT_QUEUE_MAX = 8;

const sha256 = (value: string) => createHash('sha256').update(value).digest();

/**
 * scrypt를 한 번에 SCRYPT_CONCURRENCY개만 돌린다. 시도 제한(DB)은 횟수만 막고 동시에 몰리는 것은 못 막으므로
 * 메모리(512Mi)를 넘지 않게 프로세스 안에서 줄 세운다.
 */
class ScryptGate {
  private active = 0;
  private readonly waiting: (() => void)[] = [];

  async run<T>(work: () => Promise<T>): Promise<T> {
    if (this.active >= SCRYPT_CONCURRENCY) {
      if (this.waiting.length >= SCRYPT_QUEUE_MAX) {
        throw AppException.of('RATE_LIMITED');
      }
      await new Promise<void>((resolve) => this.waiting.push(resolve));
    } else {
      this.active += 1;
    }
    try {
      return await work();
    } finally {
      const next = this.waiting.shift();
      if (next) next();
      else this.active -= 1;
    }
  }
}

/**
 * 관리자 자격 증명(env ADMIN_USERNAME · ADMIN_PASSWORD_HASH · ADMIN_TOTP_SECRET). 셋 중 하나라도 비면 관리자 기능 전체가 꺼진다
 * (/api/admin/* 404, 운영 기본). 값이 있는데 형식이 틀리면 부팅을 멈춘다(값은 메시지에 넣지 않는다).
 * 비밀번호 원문은 어디에도 없다 — scrypt 해시만 env로 받는다. TOTP 시크릿은 base32(160비트 권장, 최소 128비트).
 */
export class AdminConfig {
  readonly enabled: boolean;
  /**
   * 접근 기록(access_logs.user_id)에 남길 관리자 행위자 ID. 관리자는 users 행이 없어 아이디에서 결정적으로 만든 UUID다
   * (아이디 원문은 남기지 않는다). 꺼져 있으면 null
   */
  readonly actorId: string | null;
  /** 세션·장치 쿠키에 묶는 자격 증명 지문. 아이디·해시·TOTP 시크릿 중 하나라도 바꾸면 기존 세션·장치 쿠키가 모두 무효가 된다 */
  readonly credentialTag: string | null;
  private readonly usernameDigest: Buffer | null;
  private readonly passwordHash: ScryptHash | null;
  private readonly totpKey: Buffer | null;
  private readonly gate = new ScryptGate();

  constructor(values: {
    username?: string;
    passwordHash?: string;
    totpSecret?: string;
  }) {
    const username = values.username?.trim() ?? '';
    const rawHash = values.passwordHash?.trim() ?? '';
    const rawTotp = values.totpSecret?.trim() ?? '';
    if (!username || !rawHash || !rawTotp) {
      this.enabled = false;
      this.actorId = null;
      this.credentialTag = null;
      this.usernameDigest = null;
      this.passwordHash = null;
      this.totpKey = null;
      return;
    }
    if (!USERNAME.test(username)) {
      throw new Error(
        'ADMIN_USERNAME은 영문·숫자·._@- 3~64자여야 합니다(.env.example 참고)',
      );
    }
    const parsed = parseScryptHash(rawHash);
    if (!parsed) {
      throw new Error(
        'ADMIN_PASSWORD_HASH 형식이 잘못됐습니다(pnpm --filter @yeojeong/api admin:hash로 만든 scrypt$… 값)',
      );
    }
    const totpKey = base32Decode(rawTotp);
    if (!totpKey || totpKey.length < TOTP_MIN_SECRET_BYTES) {
      throw new Error(
        'ADMIN_TOTP_SECRET 형식이 잘못됐습니다(pnpm --filter @yeojeong/api admin:totp로 만든 base32 값, 128비트 이상)',
      );
    }
    this.enabled = true;
    this.usernameDigest = sha256(username);
    this.passwordHash = parsed;
    this.totpKey = totpKey;
    this.actorId = actorIdOf(username);
    this.credentialTag = createHash('sha256')
      .update(
        `yeojeong:admin-credential:v2\n${username}\n${rawHash}\n${totpKey.toString('hex')}`,
      )
      .digest('hex');
  }

  static fromConfig(config: ConfigService): AdminConfig {
    return new AdminConfig({
      username: config.get<string>('ADMIN_USERNAME'),
      passwordHash: config.get<string>('ADMIN_PASSWORD_HASH'),
      totpSecret: config.get<string>('ADMIN_TOTP_SECRET'),
    });
  }

  /**
   * 아이디·비밀번호 확인. 아이디는 SHA-256 다이제스트끼리 상수 시간 비교하고, 아이디가 틀려도 scrypt는 끝까지 돌려
   * 응답 시간으로 아이디가 맞았는지 드러나지 않게 한다. 둘 다 맞아야 true. TOTP는 verifyTotpCode로 따로 확인한다
   */
  async verify(username: string, password: string): Promise<boolean> {
    if (!this.usernameDigest) return false;
    const usernameOk = timingSafeEqual(sha256(username), this.usernameDigest);
    // 아이디가 틀려도 비밀번호 해시 계산을 똑같이 한다(결과는 버린다)
    const passwordOk = await this.verifyPasswordOnly(password);
    return usernameOk && passwordOk;
  }

  /** 비밀번호만 확인(재인증 step-up — 세션이 이미 관리자다) */
  async verifyPasswordOnly(password: string): Promise<boolean> {
    const stored = this.passwordHash;
    if (!stored) return false;
    return this.gate.run(() => verifyPassword(password, stored));
  }

  /** 인증 코드가 맞으면 맞은 TOTP 창 번호(재사용 금지는 AdminTotpGuard가 이 번호로 막는다), 아니면 null */
  verifyTotpCode(code: string, now = Date.now()): number | null {
    if (!this.totpKey) return null;
    return verifyTotp(this.totpKey, code, now);
  }
}

/** 아이디 → 결정적 UUID(SHA-256 앞 16바이트, version 8 · RFC 9562 variant) */
export function actorIdOf(username: string): string {
  const bytes = createHash('sha256')
    .update(`yeojeong:admin-actor:v1:${username}`)
    .digest()
    .subarray(0, 16);
  bytes[6] = (bytes[6] & 0x0f) | 0x80;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const hex = bytes.toString('hex');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}
