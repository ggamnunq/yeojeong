import { Module } from '@nestjs/common';
import { GroupsModule } from '../groups/groups.module.js';
import { AutoEndJobController } from './auto-end-job.controller.js';
import { InternalJobGuard } from './internal-job.guard.js';
import { InviteCodeGenerator } from './invite-code.generator.js';
import { PlacesController } from './places.controller.js';
import { TripEndService } from './trip-end.service.js';
import { MyTripsController, TripsController } from './trips.controller.js';
import { TripsCoreModule } from './trips-core.module.js';
import { TripsService } from './trips.service.js';

/**
 * S2A 그룹·여정·멤버십. app.module.ts에는 이 모듈 한 줄만 넣고 GroupsModule은 여기서 가져온다.
 * 문서: src/trips/README.md
 */
@Module({
  imports: [TripsCoreModule, GroupsModule],
  controllers: [
    TripsController,
    MyTripsController,
    PlacesController,
    AutoEndJobController,
  ],
  providers: [
    TripsService,
    TripEndService,
    InviteCodeGenerator,
    InternalJobGuard,
  ],
})
export class TripsModule {}
