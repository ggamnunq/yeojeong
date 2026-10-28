import { Module } from '@nestjs/common';
import { ConsentsController } from './consents.controller.js';
import { ConsentsService } from './consents.service.js';

@Module({
  controllers: [ConsentsController],
  providers: [ConsentsService],
  exports: [ConsentsService],
})
export class ConsentsModule {}
