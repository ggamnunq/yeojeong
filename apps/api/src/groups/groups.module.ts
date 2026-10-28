import { Module } from '@nestjs/common';
import { TripsCoreModule } from '../trips/trips-core.module.js';
import { GroupsController } from './groups.controller.js';
import { GroupsService } from './groups.service.js';
import { InvitesController } from './invites.controller.js';
import { InvitesService } from './invites.service.js';

/** 그룹원·강퇴·나가기·그룹 삭제, 초대코드(기능명세 1-2 groups). TripsModule이 import한다 */
@Module({
  imports: [TripsCoreModule],
  controllers: [GroupsController, InvitesController],
  providers: [GroupsService, InvitesService],
})
export class GroupsModule {}
