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
