import { randomInt } from 'node:crypto';
import { Injectable, Logger, Optional } from '@nestjs/common';
import {
  INVITE_CODE_ALPHABET,
  type DeletionRequestResponse,
  type Me,
} from '@yeojeong/shared';
import { AuthConfig } from '../common/auth/auth-config.js';
import { UnauthenticatedError } from '../common/errors/app-exception.js';
import { FeatureFlags } from '../common/features.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { walletEntryWhere } from '../wallet/wallet-summary.service.js';

const DELETION_CODE_TTL_MS = 24 * 60 * 60_000;
const DELETION_CODE_GROUPS = 3;
const DELETION_CODE_GROUP_LENGTH = 4;

/** YJD-XXXX-XXXX-XXXX. 초대코드와 같은 문자 집합(헷갈리는 0·O·1·I·L 제외), 12자 ≈ 59비트 */
export function generateDeletionCode(): string {
  const groups = Array.from({ length: DELETION_CODE_GROUPS }, () =>
    Array.from(
      { length: DELETION_CODE_GROUP_LENGTH },
      () => INVITE_CODE_ALPHABET[randomInt(INVITE_CODE_ALPHABET.length)],
    ).join(''),
  );
  return ['YJD', ...groups].join('-');
}

const KST = new Intl.DateTimeFormat('ko-KR', {
  timeZone: 'Asia/Seoul',
  dateStyle: 'long',
  timeStyle: 'short',
});

@Injectable()
export class UsersService {
  private readonly logger = new Logger(UsersService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: AuthConfig,
    @Optional() private readonly features?: FeatureFlags,
  ) {}

  async me(userId: string): Promise<Me> {
    const [user, paymentMethodCount, expired, walletEntryCount] =
      await Promise.all([
        this.prisma.user.findUnique({
          where: { id: userId },
          select: { id: true, nickname: true, profileImageUrl: true },
        }),
        this.prisma.paymentMethod.count({
          where: { userId, status: { not: 'REMOVED' } },
        }),
        this.prisma.paymentConnection.count({
          where: { userId, status: 'EXPIRED' },
        }),
        this.prisma.transaction.count({ where: walletEntryWhere(userId) }),
      ]);
    // 세션은 있는데 사용자가 없으면(탈퇴 처리 직후 등) 다시 로그인하게 한다
    if (!user) throw new UnauthenticatedError();
    return {
      id: user.id,
      nickname: user.nickname,
      profileImageUrl: user.profileImageUrl,
      hasProfileImage: user.profileImageUrl !== null,
      paymentMethodCount,
      // 계좌·카드 연결을 숨긴 동안(FR-006)은 만료 표시를 하지 않는다
      hasExpiredConnection: expired > 0 && (this.features?.accountLink ?? true),
      walletEntryCount,
    };
  }

  /**
   * 탈퇴·삭제 요청(FR-108, 서비스 내 탈퇴가 생기기 전 임시 경로). 요청 코드를 만들어 HMAC만 저장하고,
   * 고객센터로 보낼 메일 초안을 돌려준다. 메일은 보내지 않는다. 운영자는 받은 코드의 HMAC으로 요청을 찾는다.
   * 서비스 내 탈퇴(FR-109, DELETE /api/users/me)는 account 모듈에 있다. 운영자가 이 요청을 처리할 때도 같은 파이프라인을 쓴다.
   */
  async requestDeletion(userId: string): Promise<DeletionRequestResponse> {
    const code = generateDeletionCode();
    const expiresAt = new Date(Date.now() + DELETION_CODE_TTL_MS);
    const record = await this.prisma.accountDeletion.create({
      data: {
        userId,
        userRefHash: this.config.userRefHash(userId),
        channel: 'SUPPORT',
        requestCodeHash: this.config.deletionCodeHash(code),
        expiresAt,
      },
      select: { id: true },
    });
    this.logger.log(
      { accountDeletionId: record.id },
      '탈퇴·삭제 요청 코드 발급',
    );

    const to = this.config.supportEmail;
    const subject = `[여정] 탈퇴·삭제 요청 ${code}`;
    const body = [
      '여정 계정 탈퇴와 개인정보 삭제를 요청합니다.',
      '',
      `요청 코드: ${code}`,
      `코드 유효 기간: ${KST.format(expiresAt)}까지`,
    ].join('\n');
    const query = new URLSearchParams({ subject, body })
      .toString()
      .replace(/\+/g, '%20');
    return {
      code,
      expiresAt: expiresAt.toISOString(),
      mail: { to, subject, body },
      mailto: `mailto:${to}?${query}`,
    };
  }
}
