type DemoRateLimiterOptions = {
  limit: number;
  windowMs: number;
  concurrency: number;
  now?: () => number;
};

type DemoRateLimitLease =
  | { ok: true; release: () => void }
  | {
      ok: false;
      reason: "window" | "concurrency";
      retryAfterSeconds: number;
    };

export class DemoRateLimiter {
  private readonly limit: number;
  private readonly windowMs: number;
  private readonly concurrency: number;
  private readonly now: () => number;
  private windowStartedAt: number | null = null;
  private accepted = 0;
  private active = 0;

  constructor({ limit, windowMs, concurrency, now = Date.now }: DemoRateLimiterOptions) {
    this.limit = limit;
    this.windowMs = windowMs;
    this.concurrency = concurrency;
    this.now = now;
  }

  acquire(): DemoRateLimitLease {
    const now = this.now();
    if (
      this.windowStartedAt === null
      || now < this.windowStartedAt
      || now - this.windowStartedAt >= this.windowMs
    ) {
      this.windowStartedAt = now;
      this.accepted = 0;
    }

    if (this.accepted >= this.limit) {
      const elapsed = now - this.windowStartedAt;
      return {
        ok: false,
        reason: "window",
        retryAfterSeconds: Math.ceil((this.windowMs - elapsed) / 1_000),
      };
    }

    if (this.active >= this.concurrency) {
      return {
        ok: false,
        reason: "concurrency",
        retryAfterSeconds: 1,
      };
    }

    this.accepted += 1;
    this.active += 1;
    let released = false;

    return {
      ok: true,
      release: () => {
        if (released) return;
        released = true;
        this.active -= 1;
      },
    };
  }
}
