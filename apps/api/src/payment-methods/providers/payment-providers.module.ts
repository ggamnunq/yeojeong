import { Logger, Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../../prisma/prisma.service.js';
import { FinancialAccessLog } from '../access-log.js';
import { dateOnly } from '../kst.js';
import { TokenCipher } from '../token-cipher.js';
import { DEMO_DEFAULT_ANCHOR } from './demo/demo-dataset.js';
import {
  DemoTossAdapter,
  type DemoAnchorResolver,
} from './demo/demo-toss.adapter.js';
import { PaymentProviderAdapter } from './payment-provider.adapter.js';
import { TossPaymentAdapter } from './toss.adapter.js';

export type PaymentProviderName = 'demo' | 'toss';

/** env PAYMENT_PROVIDER(demo | toss). 비우면 운영은 toss, 그 밖에는 demo */
export function resolveProviderName(
  config: ConfigService,
): PaymentProviderName {
  const raw = config.get<string>('PAYMENT_PROVIDER')?.trim().toLowerCase();
  if (!raw) {
    return config.get<string>('NODE_ENV') === 'production' ? 'toss' : 'demo';
  }
  if (raw !== 'demo' && raw !== 'toss') {
    throw new Error(`PAYMENT_PROVIDER는 demo 또는 toss여야 합니다: ${raw}`);
  }
  return raw;
}

/**
 * 데모 샘플을 맞출 기준일: 진행 중 여정 중 가장 이른 시작일 → 예정 여정 중 가장 가까운 시작일 → 가장 최근 종료 여정.
 * (어댑터가 DB를 직접 보지 않도록 여기서 함수로 넘긴다)
 */
export function prismaDemoAnchor(prisma: PrismaService): DemoAnchorResolver {
  return async (userId) => {
    const rows = await prisma.membership.findMany({
      where: {
        userId,
        leftAt: null,
        group: { deletedAt: null, trip: { deletedAt: null } },
      },
      select: {
        group: {
          select: { trip: { select: { status: true, startDate: true } } },
        },
      },
    });
    const trips = rows.flatMap((r) => (r.group.trip ? [r.group.trip] : []));
    const pick = (status: string, latest = false) =>
      trips
        .filter((t) => t.status === status)
        .map((t) => dateOnly(t.startDate))
        .sort()
        .at(latest ? -1 : 0);
    return pick('ONGOING') ?? pick('UPCOMING') ?? pick('ENDED', true) ?? null;
  };
}

/** 제공자 어댑터·토큰 암호화·금융 접근 로그. payment-methods·transactions 모듈이 함께 쓴다 */
@Module({
  providers: [
    TokenCipher,
    FinancialAccessLog,
    {
      provide: PaymentProviderAdapter,
      inject: [ConfigService, PrismaService],
      useFactory: (config: ConfigService, prisma: PrismaService) => {
        const name = resolveProviderName(config);
        if (name === 'toss') return new TossPaymentAdapter();
        if (config.get<string>('NODE_ENV') === 'production') {
          new Logger('PaymentProviders').warn(
            'PAYMENT_PROVIDER=demo로 운영 모드가 떴습니다(샘플 데이터)',
          );
        }
        return new DemoTossAdapter(
          prismaDemoAnchor(prisma),
          config.get<string>('DEMO_ANCHOR_DATE') || DEMO_DEFAULT_ANCHOR,
        );
      },
    },
  ],
  exports: [TokenCipher, PaymentProviderAdapter, FinancialAccessLog],
})
export class PaymentProvidersModule {}
