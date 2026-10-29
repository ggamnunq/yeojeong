import { Injectable, Logger, Optional } from '@nestjs/common';
import type { Me } from '@yeojeong/shared';
import { UnauthenticatedError } from '../common/errors/app-exception.js';
import { FeatureFlags } from '../common/features.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { walletEntryWhere } from '../wallet/wallet-summary.service.js';
import { assertNickname } from './nickname.js';

@Injectable()
export class UsersService {
  private readonly logger = new Logger(UsersService.name);

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

  /**
   * FR-902 닉네임 변경. 규칙은 가입과 같다(assertNickname). 중복은 허용한다.
   * 멤버·결제·정산 응답은 users.nickname을 조인하므로 따로 퍼뜨릴 곳이 없다(TripEvent 승계 토스트 payload만 그때 이름 그대로).
   * 마지막 저장이 이기는 단일 필드라 버전 검사는 하지 않는다.
   */
  async updateNickname(userId: string, input: string): Promise<Me> {
    const nickname = assertNickname(input);
    const { count } = await this.prisma.user.updateMany({
      where: { id: userId },
      data: { nickname },
    });
    // 세션 확인 직후 탈퇴가 끝난 경우
    if (count === 0) throw new UnauthenticatedError();
    // 닉네임 원문은 남기지 않는다
    this.logger.log({ userId }, '닉네임 변경');
    return this.me(userId);
  }
}
