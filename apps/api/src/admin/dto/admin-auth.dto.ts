import { ApiProperty } from '@nestjs/swagger';
import type { AdminLoginRequest, AdminSessionView } from '@yeojeong/shared';
import { IsString, Matches, MaxLength, MinLength } from 'class-validator';

export class AdminLoginDto implements AdminLoginRequest {
  @ApiProperty({
    maxLength: 64,
    description: '관리자 아이디(저장·기록하지 않는다)',
  })
  @IsString({ message: '아이디를 입력해 주세요' })
  @MinLength(1, { message: '아이디를 입력해 주세요' })
  @MaxLength(64, { message: '아이디가 너무 길어요' })
  username: string;

  @ApiProperty({
    maxLength: 256,
    description: '관리자 비밀번호(저장·기록하지 않는다)',
  })
  @IsString({ message: '비밀번호를 입력해 주세요' })
  @MinLength(1, { message: '비밀번호를 입력해 주세요' })
  @MaxLength(256, { message: '비밀번호가 너무 길어요' })
  password: string;

  @ApiProperty({
    pattern: '^\\d{6}$',
    description: '인증 앱의 6자리 코드(TOTP). 한 번 쓴 코드는 다시 받지 않는다',
  })
  @IsString({ message: '인증 코드 6자리를 입력해 주세요' })
  @Matches(/^\d{6}$/, { message: '인증 코드 6자리를 입력해 주세요' })
  totp: string;
}

export class AdminSessionViewDto implements AdminSessionView {
  @ApiProperty({ enum: [true] })
  authenticated: true;

  @ApiProperty({ description: '절대 만료(로그인 + 8시간, ISO 8601 KST)' })
  expiresAt: string;

  @ApiProperty({ description: '유휴 만료(마지막 요청 + 30분, ISO 8601 KST)' })
  idleExpiresAt: string;
}
