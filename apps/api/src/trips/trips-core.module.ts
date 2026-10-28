import { Module } from '@nestjs/common';
import { DomainEventPublisher } from './domain-event.publisher.js';
import { TripDetailService } from './trip-detail.service.js';

/** trips·groups가 같이 쓰는 것: 도메인 이벤트 발행, 여정 상세 조립 */
@Module({
  providers: [DomainEventPublisher, TripDetailService],
  exports: [DomainEventPublisher, TripDetailService],
})
export class TripsCoreModule {}
