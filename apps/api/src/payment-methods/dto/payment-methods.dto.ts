import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  CONNECTION_STATUS_VALUES,
  PAYMENT_METHOD_TYPE_VALUES,
  PROVIDER_VALUES,
  SYNC_STATUS_VALUES,
  type ConnectionStatus,
  type ManualSyncResponse,
  type ManualSyncSkipReason,
  type PaymentConnectionView,
  type PaymentMethodsResponse,
  type PaymentMethodType,
  type PaymentMethodView,
  type Provider,
  type SyncStatus,
} from '@yeojeong/shared';
import { IsIn, IsOptional } from 'class-validator';

export class PaymentConnectionViewDto implements PaymentConnectionView {
  @ApiProperty({ format: 'uuid' })
  id: string;

  @ApiProperty({ enum: PROVIDER_VALUES })
  provider: Provider;

  @ApiProperty({ enum: CONNECTION_STATUS_VALUES })
  status: ConnectionStatus;

  @ApiProperty({ format: 'date-time' })
  connectedAt: string;

  @ApiProperty({ format: 'date-time', nullable: true, type: String })
  lastSyncedAt: string | null;

  @ApiProperty({ enum: SYNC_STATUS_VALUES, nullable: true })
  lastSyncStatus: SyncStatus | null;
}

export class PaymentMethodViewDto implements PaymentMethodView {
  @ApiProperty({ format: 'uuid' })
  id: string;

  @ApiProperty({ format: 'uuid' })
  connectionId: string;

  @ApiProperty({ enum: PAYMENT_METHOD_TYPE_VALUES })
  type: PaymentMethodType;

  @ApiProperty({ example: '토스뱅크' })
  institutionName: string;

  @ApiProperty({ example: '토스뱅크 체크카드' })
  productName: string;

  @ApiProperty({ example: '토스뱅크 체크카드' })
  shortLabel: string;

  @ApiProperty({ example: '**** **** **** 1934' })
  maskedNumber: string;

  @ApiProperty({ example: '1934' })
  last4: string;

  @ApiProperty({ enum: ['ACTIVE', 'EXPIRED'] })
  status: 'ACTIVE' | 'EXPIRED';

  @ApiProperty({ format: 'date-time', nullable: true, type: String })
  lastSyncedAt: string | null;
}

class PaymentMethodCountsDto {
  @ApiProperty()
  accounts: number;

  @ApiProperty()
  cards: number;
}

export class PaymentMethodsResponseDto implements PaymentMethodsResponse {
  @ApiProperty({ type: [PaymentConnectionViewDto] })
  connections: PaymentConnectionViewDto[];

  @ApiProperty({ type: [PaymentMethodViewDto] })
  methods: PaymentMethodViewDto[];

  @ApiProperty({ format: 'date-time', nullable: true, type: String })
  lastSyncedAt: string | null;

  @ApiProperty()
  hasExpiredConnection: boolean;

  @ApiProperty({ type: PaymentMethodCountsDto })
  counts: PaymentMethodCountsDto;
}

export class ManualSyncResponseDto implements ManualSyncResponse {
  @ApiProperty({ type: [String], format: 'uuid' })
  syncRunIds: string[];

  @ApiProperty({ format: 'date-time' })
  startedAt: string;

  @ApiProperty({
    enum: ['NO_ACTIVE_TRIP'],
    nullable: true,
    description:
      '진행 중 여정이 없어 제공자를 부르지 않았으면 NO_ACTIVE_TRIP(HTTP 200), 동기화를 시작했으면 null(HTTP 202)',
  })
  skipped: ManualSyncSkipReason | null;
}

export class RemovePaymentMethodQueryDto {
  @ApiPropertyOptional({
    enum: ['true', 'false'],
    description:
      '연결의 마지막 결제수단일 때만 true 허용: 내 미확정·개인 결제와 거래 원본까지 지운다',
  })
  @IsOptional()
  @IsIn(['true', 'false'], { message: 'true 또는 false로 보내 주세요' })
  purgeImported?: 'true' | 'false';
}
