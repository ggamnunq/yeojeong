import { Controller, Get, Header } from '@nestjs/common';
import {
  ApiOkResponse,
  ApiOperation,
  ApiProperty,
  ApiTags,
} from '@nestjs/swagger';
import type { ActiveNoticesResponse, NoticeView } from '@yeojeong/shared';
import { Public } from '../common/auth/decorators.js';
import { activeNotices } from './notices.js';

class NoticeViewDto implements NoticeView {
  @ApiProperty({ example: 'legal-v1.0-published' })
  id: string;

  @ApiProperty({ example: '서비스 이용약관과 개인정보처리방침을 게시했어요' })
  title: string;

  @ApiProperty({ example: '/terms', description: '앱 안 경로' })
  url: string;

  @ApiProperty({ format: 'date-time' })
  startsAt: string;

  @ApiProperty({ format: 'date-time', description: '포함하지 않음' })
  endsAt: string;
}

class ActiveNoticesResponseDto implements ActiveNoticesResponse {
  @ApiProperty({ type: [NoticeViewDto] })
  items: NoticeViewDto[];
}

@ApiTags('notices')
@Controller('notices')
export class NoticesController {
  @ApiOperation({
    summary: '게시 중인 공지 (Q-57)',
    description:
      '로그인 없이 열린다(공지는 공개 정보). 최신부터. 화면은 닫지 않은 것 중 하나만 배너로 보인다(결제내역·시작 전 여정 정보·여정 없음·마이페이지).',
  })
  @ApiOkResponse({ type: ActiveNoticesResponseDto })
  // 짧게 캐시해도 된다(게시 시작·끝은 5분 안에 반영). 로그인 상태면 세션 연장 Set-Cookie가 실릴 수 있어 공유 캐시는 막는다(private)
  @Header('Cache-Control', 'private, max-age=300')
  @Public()
  @Get('active')
  active(): ActiveNoticesResponse {
    return { items: activeNotices(new Date()) };
  }
}
