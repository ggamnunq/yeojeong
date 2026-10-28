import { ApiProperty } from '@nestjs/swagger';
import type { HealthResponse } from '@yeojeong/shared';

export class HealthResponseDto implements HealthResponse {
  @ApiProperty({ enum: ['ok'] })
  status: 'ok';

  @ApiProperty({ enum: ['up', 'down'], description: 'DB 연결 상태' })
  db: 'up' | 'down';
}
