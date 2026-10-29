import { ApiProperty } from '@nestjs/swagger';
import type {
  AdminCodefDay,
  AdminCodefResultCount,
  AdminCodefTopUser,
  AdminCodefUsage,
} from '@yeojeong/shared';

class AdminCodefResultCountDto implements AdminCodefResultCount {
  @ApiProperty({ enum: ['START', 'TWO_WAY'] })
  step: string;
  @ApiProperty({ description: 'OK · TWO_WAY_REQUIRED · PENDING · 에러 코드' })
  result: string;
  @ApiProperty()
  count: number;
}

class AdminCodefOrganizationCountDto {
  @ApiProperty({ description: 'CODEF 기관 코드' })
  organization: string;
  @ApiProperty()
  count: number;
}

class AdminCodefTodayDto {
  @ApiProperty()
  day: string;
  @ApiProperty()
  calls: number;
  @ApiProperty()
  budget: number;
  @ApiProperty()
  reserved: number;
  @ApiProperty()
  inProgress: number;
  @ApiProperty()
  remaining: number;
  @ApiProperty()
  fetchStarts: number;
  @ApiProperty()
  successes: number;
  @ApiProperty()
  failures: number;
  @ApiProperty({ type: [AdminCodefResultCountDto] })
  byResult: AdminCodefResultCountDto[];
  @ApiProperty({ type: [AdminCodefOrganizationCountDto] })
  byOrganization: AdminCodefOrganizationCountDto[];
}

class AdminCodefDayDto implements AdminCodefDay {
  @ApiProperty()
  day: string;
  @ApiProperty({
    type: Number,
    nullable: true,
    description: '7일 보관이라 그 전은 null',
  })
  codefCalls: number | null;
  @ApiProperty()
  fetchStarts: number;
  @ApiProperty()
  successes: number;
  @ApiProperty()
  failures: number;
}

class AdminCodefTopUserDto implements AdminCodefTopUser {
  @ApiProperty({ format: 'uuid' })
  userId: string;
  @ApiProperty({ type: String, nullable: true })
  nickname: string | null;
  @ApiProperty()
  count: number;
  @ApiProperty()
  limit: number;
}

class AdminCodefPendingDeletionsDto {
  @ApiProperty()
  count: number;
  @ApiProperty({ type: String, nullable: true })
  oldestCreatedAt: string | null;
}

class AdminCodefFlagsDto {
  @ApiProperty()
  featureCardImport: string;
  @ApiProperty()
  effectiveMode: string;
  @ApiProperty()
  codefEnv: string;
  @ApiProperty()
  codefLoginMode: string;
  @ApiProperty()
  allowlistCount: number;
}

export class AdminCodefUsageDto implements AdminCodefUsage {
  @ApiProperty()
  asOf: string;
  @ApiProperty({ type: AdminCodefTodayDto })
  today: AdminCodefTodayDto;
  @ApiProperty({ type: [AdminCodefDayDto] })
  days: AdminCodefDayDto[];
  @ApiProperty({ type: [AdminCodefTopUserDto] })
  topUsers: AdminCodefTopUserDto[];
  @ApiProperty()
  loginCooldownUsers: number;
  @ApiProperty({ type: AdminCodefPendingDeletionsDto })
  pendingDeletions: AdminCodefPendingDeletionsDto;
  @ApiProperty({ type: AdminCodefFlagsDto })
  flags: AdminCodefFlagsDto;
}
