import { Controller, HttpCode, Post } from '@nestjs/common';
import { ApiExcludeController, ApiOperation } from '@nestjs/swagger';
import { InternalJob } from '../common/internal-job/index.js';
import {
  CodefAccountRemover,
  type CodefCleanupResult,
} from './codef/codef-account-remover.js';

/** Cloud Scheduler(10분 주기, infra/envs/prod scheduler.tf codef_cleanup) → CODEF 계정 삭제 재시도. 인증은 전역 InternalJobGuard(OIDC) */
@ApiExcludeController()
@InternalJob()
@Controller('internal/jobs')
export class CardImportJobsController {
  constructor(private readonly remover: CodefAccountRemover) {}

  @ApiOperation({
    summary: 'CODEF 계정 삭제 재시도(10분)',
    description:
      '요청 안에서 지우지 못한 connectedId(암호화)를 다시 지운다. 성공하면 행을 지우고, 24시간 넘게 실패하면 error 로그(행 ID만)로 알린다.',
  })
  @HttpCode(200)
  @Post('codef-cleanup')
  runCleanup(): Promise<CodefCleanupResult> {
    return this.remover.cleanup();
  }
}
