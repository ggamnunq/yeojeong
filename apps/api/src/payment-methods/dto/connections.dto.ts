import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  ATTEMPT_PURPOSE_VALUES,
  ATTEMPT_STATUS_VALUES,
  PAYMENT_METHOD_TYPE_VALUES,
  type AttemptPurpose,
  type AttemptStatus,
  type ConfirmConnectionRequest,
  type ConfirmConnectionResponse,
  type ConnectionAttemptView,
  type ConnectionCandidate,
  type PaymentMethodType,
  type StartConnectionRequest,
  type StartConnectionResponse,
} from '@yeojeong/shared';
import {
  ArrayMaxSize,
  ArrayMinSize,
  ArrayUnique,
  IsArray,
  IsIn,
  IsOptional,
  IsUUID,
} from 'class-validator';

export class StartConnectionDto implements StartConnectionRequest {
  @ApiProperty({
    enum: ['TOSS'],
    description:
      '화면은 항상 TOSS. 실제 어댑터는 서버 env(PAYMENT_PROVIDER)가 고른다',
  })
  @IsIn(['TOSS'], { message: '지원하지 않는 제공자예요' })
  provider: 'TOSS';

  @ApiProperty({
    enum: ATTEMPT_PURPOSE_VALUES,
    description: 'SIGNUP(WF-05) · WALLET_ADD(WF-28) · RECONNECT(WF-42)',
  })
  @IsIn(ATTEMPT_PURPOSE_VALUES, { message: '연결 목적을 다시 확인해 주세요' })
  purpose: AttemptPurpose;

  @ApiPropertyOptional({
    format: 'uuid',
    description: 'purpose = RECONNECT일 때 필수',
  })
  @IsOptional()
  @IsUUID('all', { message: '연결 ID 형식이 아니에요' })
  reconnectConnectionId?: string;
}

export class StartConnectionResponseDto implements StartConnectionResponse {
  @ApiProperty({ format: 'uuid' })
  attemptId: string;

  @ApiProperty({ description: '새 창으로 연다. DEMO는 바로 콜백으로 돌아온다' })
  authUrl: string;

  @ApiProperty({ format: 'date-time' })
  expiresAt: string;
}

export class ConnectionAttemptViewDto implements ConnectionAttemptView {
  @ApiProperty({ format: 'uuid' })
  attemptId: string;

  @ApiProperty({ enum: ATTEMPT_STATUS_VALUES })
  status: AttemptStatus;

  @ApiProperty({ enum: ATTEMPT_PURPOSE_VALUES })
  purpose: AttemptPurpose;

  @ApiProperty({ format: 'date-time' })
  expiresAt: string;
}

export class ConnectionCandidateDto implements ConnectionCandidate {
  @ApiProperty({ format: 'uuid' })
  candidateId: string;

  @ApiProperty({ enum: PAYMENT_METHOD_TYPE_VALUES })
  type: PaymentMethodType;

  @ApiProperty({ example: '토스뱅크' })
  institutionName: string;

  @ApiProperty({ example: '토스뱅크 체크카드' })
  productName: string;

  @ApiProperty({ example: '**** **** **** 1934' })
  maskedNumber: string;

  @ApiProperty({ example: '1934' })
  last4: string;

  @ApiProperty()
  preselected: boolean;
}

export class ConfirmConnectionDto implements ConfirmConnectionRequest {
  @ApiProperty({ type: [String], format: 'uuid', minItems: 1, maxItems: 50 })
  @IsArray({ message: '연결할 항목을 골라 주세요' })
  @ArrayMinSize(1, { message: '연결할 항목을 골라 주세요' })
  @ArrayMaxSize(50, { message: '한 번에 50개까지 연결할 수 있어요' })
  @ArrayUnique({ message: '같은 항목이 두 번 있어요' })
  @IsUUID('all', { each: true, message: '후보 ID 형식이 아니에요' })
  candidateIds: string[];
}

export class ConfirmConnectionResponseDto implements ConfirmConnectionResponse {
  @ApiProperty({ example: 1 })
  accounts: number;

  @ApiProperty({ example: 2 })
  cards: number;
}
