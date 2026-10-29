import { Injectable } from '@nestjs/common';
import { AdminConfig } from './admin-config.js';
import { AdminTotpGuard } from './admin-totp-guard.js';

/** 확인 결과(접근 기록 details.reason에만 쓴다 — 응답은 어느 경우든 같은 문구) */
export type AdminCredentialOutcome =
  'OK' | 'BAD_CREDENTIALS' | 'BAD_TOTP' | 'TOTP_REPLAY';

/**
 * 관리자 인증 확인(비밀번호 scrypt + TOTP). 로그인은 아이디까지, 재인증(step-up, 파괴적 조치)은 비밀번호 + TOTP.
 * 비밀번호·아이디가 맞을 때만 TOTP 창을 차지한다(같은 코드 재사용 금지 — AdminTotpGuard). 비밀번호가 틀리면 TOTP는 계산만 하고 버린다
 */
@Injectable()
export class AdminCredentials {
  constructor(
    private readonly admin: AdminConfig,
    private readonly totp: AdminTotpGuard,
  ) {}

  async login(
    username: string,
    password: string,
    code: string,
  ): Promise<AdminCredentialOutcome> {
    const passwordOk = await this.admin.verify(username, password);
    return this.withTotp(passwordOk, code);
  }

  async stepUp(
    password: string,
    code: string,
  ): Promise<AdminCredentialOutcome> {
    const passwordOk = await this.admin.verifyPasswordOnly(password);
    return this.withTotp(passwordOk, code);
  }

  private async withTotp(
    passwordOk: boolean,
    code: string,
  ): Promise<AdminCredentialOutcome> {
    const counter = this.admin.verifyTotpCode(code);
    if (!passwordOk || !this.admin.actorId) return 'BAD_CREDENTIALS';
    if (counter === null) return 'BAD_TOTP';
    return (await this.totp.claim(this.admin.actorId, counter))
      ? 'OK'
      : 'TOTP_REPLAY';
  }
}
