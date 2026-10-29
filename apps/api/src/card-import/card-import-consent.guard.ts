import {
  Injectable,
  type CanActivate,
  type ExecutionContext,
} from '@nestjs/common';
import { CARD_IMPORT_REQUIRED_CONSENTS } from '@yeojeong/shared';
import type { Request } from 'express';
import { ConsentChecker, consentRequired } from '../common/auth/index.js';
import { UnauthenticatedError } from '../common/errors/index.js';

/**
 * CARD_IMPORT 동의 확인(없으면 403 CONSENT_REQUIRED { missing, required }).
 * @RequireConsents는 전역 ConsentGuard에서 돌아 기능 플래그(CardImportGuard, 컨트롤러 가드)보다 먼저 403을 내므로
 * 꺼진 사용자에게 기능이 있다는 것을 드러낸다. 그래서 CardImportGuard 뒤에 도는 이 가드로 확인한다.
 * @example @UseGuards(CardImportGuard, CardImportConsentGuard)
 */
@Injectable()
export class CardImportConsentGuard implements CanActivate {
  constructor(private readonly consents: ConsentChecker) {}

  async canActivate(ctx: ExecutionContext): Promise<boolean> {
    const userId = ctx.switchToHttp().getRequest<Request>().auth?.user.id;
    if (!userId) throw new UnauthenticatedError();
    const missing = await this.consents.findMissing(
      userId,
      CARD_IMPORT_REQUIRED_CONSENTS,
    );
    if (missing.length > 0) throw consentRequired(missing);
    return true;
  }
}
