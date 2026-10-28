import { ApiProperty } from '@nestjs/swagger';
import type { SyncJobResult } from '@yeojeong/shared';

export class SyncJobResultDto implements SyncJobResult {
  @ApiProperty({
    description: '대상 연결 수(진행 중 여정이 있는 사용자의 ACTIVE 연결)',
  })
  connections: number;

  @ApiProperty()
  ok: number;

  @ApiProperty()
  failed: number;

  @ApiProperty({ description: '인증 오류로 만료 처리한 연결' })
  expired: number;

  @ApiProperty({
    description: '다른 동기화가 돌고 있거나 대상 여정이 없어 건너뜀',
  })
  skipped: number;

  @ApiProperty({ description: '제공자에서 받은 거래 수' })
  fetched: number;

  @ApiProperty({ description: '새로 만든 결제(Expense) 수, 취소 자식 포함' })
  imported: number;

  @ApiProperty({ description: '10분이 지나 만료 처리한 연결 시도' })
  expiredAttempts: number;
}
