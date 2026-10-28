import { EventSeqTracker } from './event-seq.js';

describe('EventSeqTracker', () => {
  it('drops older or repeated sequence numbers per key and lets unnumbered events through', () => {
    const seq = new EventSeqTracker();
    expect(seq.accept('membership:1', 5)).toBe(true);
    expect(seq.accept('membership:1', '4')).toBe(false);
    expect(seq.accept('membership:1', 5n)).toBe(false);
    expect(seq.accept('membership:1', 6)).toBe(true);
    expect(seq.accept('membership:2', 1)).toBe(true);
    expect(seq.accept('membership:1', undefined)).toBe(true);
    expect(seq.accept('membership:1', 'not-a-number')).toBe(true);
  });

  it('forgets the oldest keys beyond the limit', () => {
    const seq = new EventSeqTracker(2);
    seq.accept('a', 10);
    seq.accept('b', 10);
    seq.accept('c', 10);
    expect(seq.accept('a', 1)).toBe(true);
  });
});
