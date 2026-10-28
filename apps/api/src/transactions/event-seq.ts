/** 이벤트 순서 번호. S2A는 bigint(같은 여정 안 단조 증가), 테스트·다른 발행자를 위해 number·string도 받는다 */
export type EventSeq = bigint | number | string;

/**
 * 같은 대상(여정·멤버십)의 이벤트가 순서가 뒤바뀌어 오면 오래된 것을 버린다.
 * eventSeq가 없는 이벤트는 항상 통과한다(처리 자체가 멱등이고 DB 상태를 다시 읽으므로 안전하다).
 * 인스턴스 메모리라 재시작하면 비워진다 — 영속 순서가 필요해지면 P2 outbox(ProcessedEvent)로 옮긴다.
 */
export class EventSeqTracker {
  private readonly last = new Map<string, bigint>();

  constructor(private readonly maxKeys = 10_000) {}

  /** 처리해도 되면 true(그리고 기록), 이미 본 순번 이하면 false */
  accept(key: string, seq: EventSeq | undefined | null): boolean {
    if (seq === undefined || seq === null || seq === '') return true;
    let value: bigint;
    try {
      value = BigInt(seq);
    } catch {
      return true;
    }
    const prev = this.last.get(key);
    if (prev !== undefined && value <= prev) return false;
    if (this.last.size >= this.maxKeys && prev === undefined) {
      // 오래된 키부터 버린다(Map은 넣은 순서를 지킨다)
      const oldest = this.last.keys().next().value;
      if (oldest !== undefined) this.last.delete(oldest);
    }
    this.last.set(key, value);
    return true;
  }
}
