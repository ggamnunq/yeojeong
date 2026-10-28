import { ApiProperty } from '@nestjs/swagger';
import type { DeleteAccountRequest } from '@yeojeong/shared';
import { Equals } from 'class-validator';

export class DeleteAccountDto implements DeleteAccountRequest {
  @ApiProperty({
    enum: [true],
    description:
      '탈퇴 확인 다이얼로그(부록 C-13)에서 "탈퇴"를 눌렀을 때만 true. 없거나 false면 400',
  })
  @Equals(true, { message: '탈퇴 확인이 필요해요' })
  confirm: true;
}
