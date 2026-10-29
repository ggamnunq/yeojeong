import { ApiProperty } from '@nestjs/swagger';
import type { DeletionRequestResponse, Me } from '@yeojeong/shared';

export class MeDto implements Me {
  @ApiProperty({ format: 'uuid' })
  id: string;

  @ApiProperty({ example: '준용' })
  nickname: string;

  @ApiProperty({
    type: String,
    nullable: true,
    description: '카카오 프사(https). null이면 기본 이미지',
  })
  profileImageUrl: string | null;

  @ApiProperty({ description: 'false면 기본 이미지를 쓴다(FR-105)' })
  hasProfileImage: boolean;

  @ApiProperty({ description: '연결 해제되지 않은 결제수단 수' })
  paymentMethodCount: number;

  @ApiProperty()
  hasExpiredConnection: boolean;

  @ApiProperty({
    description:
      '지갑 항목 수(GET /api/wallet/entries에 보이는 전체: 직접 입력 + 가져온 거래, 지운 항목·계좌·카드 중복 제외). 서버는 항상 채운다',
  })
  walletEntryCount: number;
}

class DeletionMailDto {
  @ApiProperty({ example: 'support@jinyeojeong.com' })
  to: string;

  @ApiProperty()
  subject: string;

  @ApiProperty()
  body: string;
}

export class DeletionRequestResponseDto implements DeletionRequestResponse {
  @ApiProperty({
    example: 'YJD-K7M2-QX9A-B3CD',
    description: '24시간 유효한 본인 확인 코드',
  })
  code: string;

  @ApiProperty({ format: 'date-time' })
  expiresAt: string;

  @ApiProperty({ type: DeletionMailDto })
  mail: DeletionMailDto;

  @ApiProperty({
    description: '화면이 여는 메일 초안 링크. 서버는 메일을 보내지 않는다',
  })
  mailto: string;
}
