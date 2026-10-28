import { ApiPropertyOptional } from '@nestjs/swagger';
import type { PurgeJobRequest } from '@yeojeong/shared';
import { IsBoolean, IsOptional } from 'class-validator';

export class PurgeJobDto implements PurgeJobRequest {
  @ApiPropertyOptional({ description: 'true면 지우지 않고 대상 건수만 센다' })
  @IsOptional()
  @IsBoolean({ message: 'dryRun은 true 또는 false여야 해요' })
  dryRun?: boolean;
}
