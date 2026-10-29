import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  ArrayMaxSize,
  IsArray,
  IsBoolean,
  IsIn,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
} from 'class-validator';

// 화면 오류 보고 본문(apps/web/src/app/clientErrors.ts의 ClientErrorReport와 같은 모양).
// 화면이 이미 가려서 보내지만 서버도 형식을 좁게 받고(경로 템플릿·파일이름:줄:열·UA 요약), 메시지는 다시 가린다(client-error-mask.ts).

export const CLIENT_ERROR_SOURCES = ['boundary', 'window', 'promise'] as const;
export type ClientErrorSource = (typeof CLIENT_ERROR_SOURCES)[number];

export const CLIENT_ERROR_MESSAGE_MAX_LENGTH = 500;
export const CLIENT_ERROR_MAX_STACK_FRAMES = 8;

/** 경로 템플릿(/trips/:tripId/payments, 없는 화면 /*) 또는 (unknown). 쿼리·해시가 들어갈 자리가 없다 */
export const ROUTE_TEMPLATE = /^(?:\/[\w.:*/-]{0,199}|\(unknown\))$/;
/** 스택 한 줄: 파일이름:줄:열 또는 (external) */
export const STACK_FRAME =
  /^(?:\(external\)|[\w.@$~+-]{1,100}:\d{1,7}:\d{1,7})$/;

export class ClientErrorReportDto {
  @ApiProperty({
    example: 'ccd404d9a1b2',
    description: '번들 빌드 ID(커밋 SHA 앞 12자)',
  })
  @IsString()
  @Matches(/^[\w.-]{1,64}$/)
  buildId: string;

  @ApiProperty({
    example: '/trips/:tripId/payments',
    description: '경로 템플릿. 실제 ID·쿼리·해시는 싣지 않는다',
  })
  @IsString()
  @Matches(ROUTE_TEMPLATE)
  route: string;

  @ApiProperty({ enum: CLIENT_ERROR_SOURCES, example: 'boundary' })
  @IsIn(CLIENT_ERROR_SOURCES)
  source: ClientErrorSource;

  @ApiProperty({ example: 'TypeError' })
  @IsString()
  @Matches(/^[\w$.-]{1,60}$/)
  name: string;

  @ApiProperty({
    example:
      'Failed to fetch dynamically imported module: …/NewTripPage-B3x9aQ.js',
    description: '화면이 가린 메시지(500자). 서버가 다시 가린다',
  })
  @IsString()
  @MaxLength(CLIENT_ERROR_MESSAGE_MAX_LENGTH)
  message: string;

  @ApiProperty({
    type: [String],
    example: ['NewTripPage-B3x9aQ.js:1:2345', 'index-Cx1.js:12:9'],
  })
  @IsArray()
  @ArrayMaxSize(CLIENT_ERROR_MAX_STACK_FRAMES)
  @Matches(STACK_FRAME, { each: true })
  stack: string[];

  @ApiProperty({
    example: 'Safari 18 / iOS 18',
    description: '브라우저·OS 주버전 요약(원문 User-Agent 아님)',
  })
  @IsString()
  @Matches(/^[\w .?/-]{0,80}$/)
  userAgent: string;

  @ApiProperty({ description: 'chunk(동적 import) 로드 실패인지' })
  @IsBoolean()
  chunk: boolean;

  @ApiPropertyOptional({
    description:
      '배포된 빌드(/version.json)와 다른 옛 번들인지. 확인하지 못했으면 없음',
  })
  @IsOptional()
  @IsBoolean()
  staleBuild?: boolean;
}
