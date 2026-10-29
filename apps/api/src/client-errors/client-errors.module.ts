import { Module } from '@nestjs/common';
import { ClientErrorsController } from './client-errors.controller.js';
import { ClientErrorsService } from './client-errors.service.js';

/** 화면 오류 보고(POST /api/client-errors → 구조화 로그). 본문 크기 상한 미들웨어는 setup-app.ts가 붙인다 */
@Module({
  controllers: [ClientErrorsController],
  providers: [ClientErrorsService],
})
export class ClientErrorsModule {}
