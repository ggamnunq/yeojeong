import { ApiProperty } from '@nestjs/swagger';
import type { Me, UpdateMeRequest } from '@yeojeong/shared';
import { IsString, MaxLength } from 'class-validator';

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

export class UpdateMeDto implements UpdateMeRequest {
  @ApiProperty({
    example: '준용이',
    description:
      '가입 닉네임과 같은 규칙: 앞뒤 공백 제거 후 1~10자(이모지는 한 글자), 줄바꿈·제어 문자 불가. 중복 허용',
  })
  @IsString({ message: '닉네임을 입력해 주세요' })
  @MaxLength(100, { message: '닉네임은 10자까지 쓸 수 있어요' })
  nickname: string;
}
