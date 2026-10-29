import { Controller, Get, HttpCode, Post, Req } from '@nestjs/common';
import { ApiExcludeController } from '@nestjs/swagger';
import type { Request } from 'express';
import { ExternalWebhook } from '../common/auth/decorators.js';
import { KakaoUnlinkService } from './kakao/kakao-unlink.service.js';

/**
 * 카카오 "연결 끊기 알림" 콜백(기능명세 7-1, 미결 Q-32 기본안 = 세션 전체 폐기 + 운영 알림).
 * 카카오디벨로퍼스 [앱 > 고급 > 연결 끊기 알림]에 https://jinyeojeong.com/api/auth/kakao/unlink 를 등록한다(GET·POST 모두 받는다).
 * 카카오 서버 → Cloudflare Worker(/api/*, origin lock 헤더를 붙여 Cloud Run으로 넘김) → 여기. Authorization 헤더는 Worker가 그대로 넘긴다.
 * 브라우저 요청이 아니라 CSRF·로그인 확인을 건너뛰고(@ExternalWebhook), `Authorization: KakaoAK {Admin 키}`를 상수 시간으로 비교한다.
 * KAKAO_ADMIN_KEY가 없으면 404(기능 꺼짐). 성공은 항상 200 빈 본문(회원 여부를 드러내지 않는다).
 */
@ApiExcludeController()
@Controller('auth/kakao')
export class KakaoUnlinkController {
  constructor(private readonly unlink: KakaoUnlinkService) {}

  @ExternalWebhook()
  @HttpCode(200)
  @Get('unlink')
  receiveGet(@Req() req: Request): Promise<void> {
    return this.receive(req);
  }

  @ExternalWebhook()
  @HttpCode(200)
  @Post('unlink')
  receivePost(@Req() req: Request): Promise<void> {
    return this.receive(req);
  }

  private async receive(req: Request): Promise<void> {
    this.unlink.assertEnabled();
    const notice = await this.unlink.readNotice(req);
    this.unlink.authenticate(req, notice.appId);
    await this.unlink.handle(notice);
  }
}
