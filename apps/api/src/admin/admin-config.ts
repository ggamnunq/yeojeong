import { createHash, timingSafeEqual } from 'node:crypto';
import { ConfigService } from '@nestjs/config';
import {
  parseScryptHash,
  verifyPassword,
  type ScryptHash,
} from './password-hash.js';

const USERNAME = /^[A-Za-z0-9._@-]{3,64}$/;

const sha256 = (value: string) => createHash('sha256').update(value).digest();

/**
 * 관리자 자격 증명(env ADMIN_USERNAME · ADMIN_PASSWORD_HASH). 둘 중 하나라도 비면 관리자 기능 전체가 꺼진다(/api/admin/* 404, 운영 기본).
 * 값이 있는데 형식이 틀리면 부팅을 멈춘다(값은 메시지에 넣지 않는다). 비밀번호 원문은 어디에도 없다 — 해시만 env로 받는다.
 */
export class AdminConfig {
  readonly enabled: boolean;
  /**
   * 접근 기록(access_logs.user_id)에 남길 관리자 행위자 ID. 관리자는 users 행이 없어 아이디에서 결정적으로 만든 UUID다
   * (아이디 원문은 남기지 않는다). 꺼져 있으면 null
   */
  readonly actorId: string | null;
  /** 세션에 묶는 자격 증명 지문. 아이디·해시를 바꾸면 기존 관리자 세션이 모두 무효가 된다 */
  readonly credentialTag: string | null;
  private readonly usernameDigest: Buffer | null;
  private readonly passwordHash: ScryptHash | null;

  constructor(values: { username?: string; passwordHash?: string }) {
    const username = values.username?.trim() ?? '';
    const rawHash = values.passwordHash?.trim() ?? '';
    if (!username || !rawHash) {
      this.enabled = false;
      this.actorId = null;
      this.credentialTag = null;
      this.usernameDigest = null;
      this.passwordHash = null;
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
    this.enabled = true;
    this.usernameDigest = sha256(username);
    this.passwordHash = parsed;
    this.actorId = actorIdOf(username);
    this.credentialTag = createHash('sha256')
      .update(`yeojeong:admin-credential:v1\n${username}\n${rawHash}`)
      .digest('hex');
  }

  static fromConfig(config: ConfigService): AdminConfig {
    return new AdminConfig({
      username: config.get<string>('ADMIN_USERNAME'),
      passwordHash: config.get<string>('ADMIN_PASSWORD_HASH'),
    });
  }

  /**
   * 아이디·비밀번호 확인. 아이디는 SHA-256 다이제스트끼리 상수 시간 비교하고, 아이디가 틀려도 scrypt는 끝까지 돌려
   * 응답 시간으로 아이디가 맞았는지 드러나지 않게 한다. 둘 다 맞아야 true
   */
  async verify(username: string, password: string): Promise<boolean> {
    if (!this.usernameDigest || !this.passwordHash) return false;
    const usernameOk = timingSafeEqual(sha256(username), this.usernameDigest);
    // 아이디가 틀려도 비밀번호 해시 계산을 똑같이 한다(결과는 버린다)
    const passwordOk = await verifyPassword(password, this.passwordHash);
    return usernameOk && passwordOk;
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
