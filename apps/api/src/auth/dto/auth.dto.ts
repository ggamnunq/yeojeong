import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import type {
  AuthSessionResponse,
  AuthStatus,
  FeatureFlags,
  ReconsentRequest,
  SignupDraft,
  SignupRequest,
  SignupResponse,
} from '@yeojeong/shared';
import { IsString, MaxLength } from 'class-validator';
import {
  AgreementsBodyDto,
  ConsentRequirementDto,
} from '../../consents/dto/consent.dto.js';
import { MeDto } from '../../users/dto/user.dto.js';

export class SignupDto extends AgreementsBodyDto implements SignupRequest {
  @ApiProperty({
    example: '준용',
    description:
      '앞뒤 공백 제거 후 1~10자(이모지는 한 글자), 줄바꿈 불가. 중복 허용',
  })
  @IsString({ message: '닉네임을 입력해 주세요' })
  @MaxLength(100, { message: '닉네임은 10자까지 쓸 수 있어요' })
  nickname: string;
}

export class ReconsentDto
  extends AgreementsBodyDto
  implements ReconsentRequest {}

class SignupDraftDto implements SignupDraft {
  @ApiProperty({
    type: String,
    nullable: true,
    description: '닉네임 화면 미리 채움(화면이 앞 10자만 쓴다)',
  })
  kakaoNickname: string | null;

  @ApiProperty({ type: String, nullable: true })
  profileImageUrl: string | null;

  @ApiProperty({
    type: String,
    nullable: true,
    example: '/join?code=K7M2QX',
    description:
      '로그인 시작 때 받은 돌아갈 화면 경로(같은 origin 상대 경로만). 가입을 마친 뒤 이리로 보낸다',
  })
  returnTo: string | null;
}

export class SignupResponseDto extends MeDto implements SignupResponse {
  @ApiProperty({
    type: String,
    nullable: true,
    example: '/join?code=K7M2QX',
    description:
      '가입을 마친 뒤 갈 화면(로그인 시작 때 받은 returnTo, 같은 origin 상대 경로만). null이면 진입 라우팅',
  })
  returnTo: string | null;
}

export class FeatureFlagsDto implements FeatureFlags {
  @ApiProperty({
    description:
      '계좌·카드 자동 불러오기(토스 연결). false면 화면이 연결 진입점을 숨긴다(env FEATURE_ACCOUNT_LINK, 기본 false)',
  })
  accountLink: boolean;
}

export class AuthSessionResponseDto implements AuthSessionResponse {
  @ApiProperty({ enum: ['ANONYMOUS', 'SIGNUP_REQUIRED', 'AUTHENTICATED'] })
  status: AuthStatus;

  @ApiPropertyOptional({ type: MeDto })
  user?: MeDto;

  @ApiPropertyOptional({ type: SignupDraftDto })
  signupDraft?: SignupDraftDto;

  @ApiPropertyOptional({
    type: [ConsentRequirementDto],
    description: 'AUTHENTICATED일 때만. 비어 있지 않으면 재동의 화면(FR-107)',
  })
  reconsentRequired?: ConsentRequirementDto[];

  @ApiProperty({
    type: FeatureFlagsDto,
    description: '기능 플래그. 로그인 여부와 무관하게 항상 온다',
  })
  features: FeatureFlagsDto;
}
