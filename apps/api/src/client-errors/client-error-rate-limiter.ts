/**
 * 고정 창(window) 카운터. 인스턴스 메모리에만 둔다(Cloud Run 인스턴스마다 따로 센다 — 로그 폭주를 막는 용도라 충분하다).
 * 키가 너무 많아지면 만료된 것부터 지우고, 그래도 많으면 비운다(메모리 상한).
 */
export class FixedWindowLimiter {
  private readonly windows = new Map<
    string,
    { count: number; resetAt: number }
  >();

  constructor(
    private readonly limit: number,
    private readonly windowMs: number,
    private readonly maxKeys = 10_000,
  ) {}

  /** 이번 요청을 세고, 한도 안이면 true */
  take(key: string, now = Date.now()): boolean {
    const current = this.windows.get(key);
    if (!current || current.resetAt <= now) {
      this.evictIfFull(now);
      this.windows.set(key, { count: 1, resetAt: now + this.windowMs });
      return true;
    }
    current.count += 1;
    return current.count <= this.limit;
  }

  get size() {
    return this.windows.size;
  }

  private evictIfFull(now: number) {
    if (this.windows.size < this.maxKeys) return;
    for (const [key, value] of this.windows) {
      if (value.resetAt <= now) this.windows.delete(key);
    }
    if (this.windows.size >= this.maxKeys) this.windows.clear();
  }
}
