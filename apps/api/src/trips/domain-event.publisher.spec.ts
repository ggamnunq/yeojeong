import { Logger } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { DomainEventPublisher } from './domain-event.publisher.js';
import { TRIP_EVENTS, type DomainEvent } from './events.js';

const left = (eventSeq: bigint): DomainEvent => ({
  name: TRIP_EVENTS.MEMBERSHIP_LEFT,
  payload: {
    tripId: 't',
    groupId: 'g',
    membershipId: 'm',
    userId: 'u',
    reason: 'LEFT',
    eventSeq,
    occurredAt: new Date(),
  },
});

describe('DomainEventPublisher', () => {
  it('delivers events in order and waits for async listeners', async () => {
    const emitter = new EventEmitter2();
    const seen: bigint[] = [];
    emitter.on(
      TRIP_EVENTS.MEMBERSHIP_LEFT,
      async (payload: { eventSeq: bigint }) => {
        await new Promise((resolve) => setTimeout(resolve, 5));
        seen.push(payload.eventSeq);
      },
    );
    await new DomainEventPublisher(emitter).publish(left(1n), left(2n));
    expect(seen).toEqual([1n, 2n]);
  });

  it('works without listeners and never throws listener errors', async () => {
    const emitter = new EventEmitter2();
    const publisher = new DomainEventPublisher(emitter);
    await expect(publisher.publish(left(1n))).resolves.toBeUndefined();
    expect(publisher.hasListeners(TRIP_EVENTS.MEMBERSHIP_LEFT)).toBe(false);

    emitter.on(TRIP_EVENTS.MEMBERSHIP_LEFT, () =>
      Promise.reject(new Error('boom')),
    );
    const logError = vi
      .spyOn(Logger.prototype, 'error')
      .mockImplementation(() => {});
    await expect(publisher.publish(left(2n))).resolves.toBeUndefined();
    expect(logError).toHaveBeenCalledOnce();
    expect(publisher.hasListeners(TRIP_EVENTS.MEMBERSHIP_LEFT)).toBe(true);
  });

  it('stops waiting after the timeout', async () => {
    vi.spyOn(Logger.prototype, 'warn').mockImplementation(() => {});
    const emitter = new EventEmitter2();
    emitter.on(TRIP_EVENTS.MEMBERSHIP_LEFT, () => new Promise(() => {}));
    const result = await new DomainEventPublisher(emitter).publishWithin(
      20,
      left(1n),
    );
    expect(result).toBe('timeout');
  });
});
