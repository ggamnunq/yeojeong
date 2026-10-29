import { Module } from '@nestjs/common';
import { NoticesController } from './notices.controller.js';

@Module({
  controllers: [NoticesController],
})
export class NoticesModule {}
