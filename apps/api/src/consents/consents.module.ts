import { Module } from '@nestjs/common';
import { ConsentIpBackfillController } from './consent-ip-backfill.controller.js';
import { ConsentIpBackfillService } from './consent-ip-backfill.js';
import { ConsentsController } from './consents.controller.js';
import { ConsentsService } from './consents.service.js';

@Module({
  controllers: [ConsentsController, ConsentIpBackfillController],
  providers: [ConsentsService, ConsentIpBackfillService],
  exports: [ConsentsService],
})
export class ConsentsModule {}
