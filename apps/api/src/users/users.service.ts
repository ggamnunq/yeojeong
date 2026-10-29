import { Injectable, Optional } from '@nestjs/common';
import type { Me } from '@yeojeong/shared';
import { UnauthenticatedError } from '../common/errors/app-exception.js';
import { FeatureFlags } from '../common/features.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { walletEntryWhere } from '../wallet/wallet-summary.service.js';

@Injectable()
export class UsersService {
  constructor(
    private readonly prisma: PrismaService,
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
}
